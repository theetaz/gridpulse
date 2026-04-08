import type { Env } from '../types/env';
import type { ParsedOutage } from '../types/ceb';
import { fetchAreaOutages, parseCluster } from '../cron/ceb-parser';
import { boundingBox, haversineKm } from '../utils/geo';

/**
 * Cache-first, on-demand CEB poller.
 *
 * The worker is the only thing that ever calls cebcare.ceb.lk — clients
 * (browsers) only see /api/*. pollArea(areaId) is the single entrypoint:
 *
 *   1. If `areas.last_polled_at` is within FRESH_TTL_MS → return cached
 *      rows from D1 without touching CEB.
 *   2. Otherwise fetch CEB, upsert changes, flip stale outages to
 *      'resolved', bump last_polled_at, and return the fresh view.
 *
 * Call pollAreasNear(lat, lon) when you only know the user's location.
 */

export const FRESH_TTL_MS = 10 * 60 * 1000; // 10 minutes
const NEARBY_LIMIT = 5; // poll this many nearest areas per "near me" request
const NEARBY_RADIUS_KM = 40; // …within this distance

interface AreaRow {
  area_id: string;
  area_name: string | null;
  province_id: string | null;
  center_lat: number | null;
  center_lon: number | null;
  last_polled_at: string | null;
}

export interface PollResult {
  areaId: string;
  cached: boolean;
  outageCount: number;
  inserted?: number;
  updated?: number;
  resolved?: number;
  error?: string;
}

/**
 * Polls one area on-demand, with D1 as the cache.
 */
export async function pollArea(env: Env, areaId: string): Promise<PollResult> {
  const row = await env.DB.prepare(
    `SELECT area_id, area_name, province_id, center_lat, center_lon, last_polled_at
       FROM areas WHERE area_id = ?`,
  )
    .bind(areaId)
    .first<AreaRow>();

  if (!row) {
    return { areaId, cached: false, outageCount: 0, error: 'unknown area' };
  }

  // Cache hit — return current D1 state, no CEB call
  if (row.last_polled_at && !isStale(row.last_polled_at)) {
    const { results } = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM ceb_outages WHERE area_id = ? AND status = 'active'`,
    )
      .bind(areaId)
      .all<{ c: number }>();
    return {
      areaId,
      cached: true,
      outageCount: results[0]?.c ?? 0,
    };
  }

  // Cache miss — fetch from CEB and reconcile
  try {
    const clusters = await fetchAreaOutages(env.CEB_BASE_URL, areaId);
    const fetched: ParsedOutage[] = clusters.map((c) => parseCluster(c, areaId));
    const diff = await applyDiff(env, areaId, fetched);
    await env.DB.prepare(
      `UPDATE areas SET last_polled_at = datetime('now'), updated_at = datetime('now') WHERE area_id = ?`,
    )
      .bind(areaId)
      .run();
    return {
      areaId,
      cached: false,
      outageCount: fetched.length,
      ...diff,
    };
  } catch (err) {
    return {
      areaId,
      cached: false,
      outageCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Find the areas nearest to a point and poll each. Returns one
 * PollResult per area so callers can surface cache-hit diagnostics.
 */
export async function pollAreasNear(
  env: Env,
  lat: number,
  lon: number,
  opts: { limit?: number; radiusKm?: number } = {},
): Promise<PollResult[]> {
  const limit = opts.limit ?? NEARBY_LIMIT;
  const radiusKm = opts.radiusKm ?? NEARBY_RADIUS_KM;
  const bb = boundingBox(lat, lon, radiusKm);

  // Prefilter by bounding box, then refine with Haversine in JS
  const { results } = await env.DB.prepare(
    `SELECT area_id, area_name, province_id, center_lat, center_lon, last_polled_at
       FROM areas
      WHERE center_lat IS NOT NULL
        AND center_lon IS NOT NULL
        AND center_lat BETWEEN ? AND ?
        AND center_lon BETWEEN ? AND ?`,
  )
    .bind(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon)
    .all<AreaRow>();

  const ranked = results
    .map((r) => ({
      row: r,
      distance: haversineKm(lat, lon, r.center_lat!, r.center_lon!),
    }))
    .filter((r) => r.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  // Poll in parallel — these are all cache-hits or single CEB calls
  return Promise.all(ranked.map(({ row }) => pollArea(env, row.area_id)));
}

function isStale(isoOrSqlite: string): boolean {
  // D1's datetime('now') returns "YYYY-MM-DD HH:MM:SS" (UTC). Convert.
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(isoOrSqlite)
    ? isoOrSqlite.replace(' ', 'T') + 'Z'
    : isoOrSqlite;
  const ts = Date.parse(normalized);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > FRESH_TTL_MS;
}

/**
 * Given a fresh set of clusters for one area, insert new ones,
 * touch-update existing ones, and mark any that disappeared as resolved.
 * Returns the counts of each operation.
 */
async function applyDiff(
  env: Env,
  areaId: string,
  fetched: ParsedOutage[],
): Promise<{ inserted: number; updated: number; resolved: number }> {
  const { results: activeRows } = await env.DB.prepare(
    `SELECT id FROM ceb_outages WHERE area_id = ? AND status = 'active'`,
  )
    .bind(areaId)
    .all<{ id: string }>();
  const activeIds = new Set(activeRows.map((r) => r.id));

  const seen = new Set<string>();
  const toInsert: ParsedOutage[] = [];
  const toUpdate: ParsedOutage[] = [];
  for (const o of fetched) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    if (activeIds.has(o.id)) toUpdate.push(o);
    else toInsert.push(o);
  }
  const toResolve: string[] = [];
  for (const id of activeIds) {
    if (!seen.has(id)) toResolve.push(id);
  }

  const statements: D1PreparedStatement[] = [];

  for (const o of toInsert) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO ceb_outages (
           id, area_id, outage_type_id, num_customers, timestamp, generated_time,
           start_time, end_time, group_id, interruption_id, interruption_type,
           polygon, centroid_lat, centroid_lon, status, first_seen_at, last_seen_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`,
      ).bind(
        o.id,
        o.areaId,
        o.outageTypeId,
        o.numCustomers,
        o.timestamp,
        o.generatedTime,
        o.startTime,
        o.endTime,
        o.groupId,
        o.interruptionId,
        o.interruptionType,
        JSON.stringify(o.polygon),
        o.centroidLat,
        o.centroidLon,
      ),
    );
  }

  for (const o of toUpdate) {
    statements.push(
      env.DB.prepare(
        `UPDATE ceb_outages
            SET num_customers = ?,
                polygon = ?,
                timestamp = ?,
                generated_time = ?,
                last_seen_at = datetime('now')
          WHERE id = ?`,
      ).bind(o.numCustomers, JSON.stringify(o.polygon), o.timestamp, o.generatedTime, o.id),
    );
  }

  for (const id of toResolve) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO outage_history (
           id, source, source_id, area_id, outage_type, num_customers,
           started_at, resolved_at, duration_mins, centroid_lat, centroid_lon
         )
         SELECT lower(hex(randomblob(8))), 'ceb', id, area_id,
                CAST(outage_type_id AS TEXT), num_customers,
                first_seen_at, datetime('now'),
                CAST((julianday('now') - julianday(first_seen_at)) * 1440 AS INTEGER),
                centroid_lat, centroid_lon
           FROM ceb_outages WHERE id = ?`,
      ).bind(id),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE ceb_outages SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?`,
      ).bind(id),
    );
  }

  // D1 batch size limit is 100; chunk defensively
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50));
  }

  return {
    inserted: toInsert.length,
    updated: toUpdate.length,
    resolved: toResolve.length,
  };
}
