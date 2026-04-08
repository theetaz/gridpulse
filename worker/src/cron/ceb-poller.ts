import type { Env } from '../types/env';
import type { ParsedOutage } from '../types/ceb';
import { fetchAreaOutages, parseCluster } from './ceb-parser';

// CEB rate-limits aggressively. We stay fully sequential and pause
// between requests. 45 areas × ~1.5s ≈ 70 s per poll — well inside
// the 30-minute cron window, and gentle enough that CEB treats us
// the same as any normal browser tab.
const FETCH_CONCURRENCY = 1;
const FETCH_DELAY_MS = 1500;
const D1_BATCH_SIZE = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PollSummary {
  areasPolled: number;
  fetched: number;
  inserted: number;
  updated: number;
  resolved: number;
  errors: Array<{ areaId: string; message: string }>;
  durationMs: number;
}

/**
 * Polls CEB /Incognito/* endpoints for every area in D1 and reconciles
 * the result against `ceb_outages`.
 *
 * - new clusters → INSERT (status='active')
 * - clusters seen again → UPDATE (last_seen_at, num_customers, polygon)
 * - clusters that disappeared → mark resolved + append to outage_history
 *
 * Pass `areaIds` to scope the poll to a subset (used by the dev trigger
 * endpoint to test against a single area without burning the rate limit).
 *
 * KV caching, DO broadcasts, and push notifications will plug in later.
 */
export async function pollCEBData(
  env: Env,
  options: { areaIds?: string[] } = {},
): Promise<PollSummary> {
  const startedAt = Date.now();
  const summary: PollSummary = {
    areasPolled: 0,
    fetched: 0,
    inserted: 0,
    updated: 0,
    resolved: 0,
    errors: [],
    durationMs: 0,
  };

  // 1. Resolve which areas to poll (all by default, or a caller-supplied subset)
  let areaIds: string[];
  if (options.areaIds && options.areaIds.length > 0) {
    areaIds = options.areaIds;
  } else {
    const { results: areaRows } = await env.DB.prepare('SELECT area_id FROM areas').all<{
      area_id: string;
    }>();
    areaIds = areaRows.map((r) => r.area_id);
  }
  summary.areasPolled = areaIds.length;

  // 2. Fetch every area, throttled. Track which areas succeeded so we
  //    don't accidentally mark outages as resolved when their area errored.
  const fetched: ParsedOutage[] = [];
  const successfulAreas = new Set<string>();
  for (let i = 0; i < areaIds.length; i += FETCH_CONCURRENCY) {
    const batch = areaIds.slice(i, i + FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchAreaOutages(env.CEB_BASE_URL, id)),
    );
    settled.forEach((result, idx) => {
      const areaId = batch[idx];
      if (result.status === 'fulfilled') {
        successfulAreas.add(areaId);
        for (const cluster of result.value) {
          fetched.push(parseCluster(cluster, areaId));
        }
      } else {
        summary.errors.push({
          areaId,
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
    if (i + FETCH_CONCURRENCY < areaIds.length) {
      await sleep(FETCH_DELAY_MS);
    }
  }
  summary.fetched = fetched.length;

  // 3. Read currently-active outages from D1 (id + area_id so we can
  //    scope the resolution check to areas we actually polled).
  const { results: activeRows } = await env.DB.prepare(
    "SELECT id, area_id FROM ceb_outages WHERE status = 'active'",
  ).all<{ id: string; area_id: string }>();
  const activeIds = new Set(activeRows.map((r) => r.id));
  const activeAreaById = new Map(activeRows.map((r) => [r.id, r.area_id]));

  // 4. Diff
  const seen = new Set<string>();
  const toInsert: ParsedOutage[] = [];
  const toUpdate: ParsedOutage[] = [];
  for (const o of fetched) {
    if (seen.has(o.id)) continue; // dedupe within poll
    seen.add(o.id);
    if (activeIds.has(o.id)) {
      toUpdate.push(o);
    } else {
      toInsert.push(o);
    }
  }
  // An outage is only resolved if its area was successfully polled AND
  // it didn't show up in this poll. Outages in errored areas are left
  // alone — they'll be reconciled on the next successful poll.
  const toResolve: string[] = [];
  for (const id of activeIds) {
    if (seen.has(id)) continue;
    const areaId = activeAreaById.get(id);
    if (areaId && successfulAreas.has(areaId)) {
      toResolve.push(id);
    }
  }

  // 5. Build statements
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
    // Snapshot the row into history before flipping its status.
    statements.push(
      env.DB.prepare(
        `INSERT INTO outage_history (
            id, source, source_id, area_id, outage_type, num_customers,
            started_at, resolved_at, duration_mins, centroid_lat, centroid_lon
          )
          SELECT
            lower(hex(randomblob(8))),
            'ceb',
            id,
            area_id,
            CAST(outage_type_id AS TEXT),
            num_customers,
            first_seen_at,
            datetime('now'),
            CAST((julianday('now') - julianday(first_seen_at)) * 1440 AS INTEGER),
            centroid_lat,
            centroid_lon
          FROM ceb_outages WHERE id = ?`,
      ).bind(id),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE ceb_outages SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?`,
      ).bind(id),
    );
  }

  // 6. Execute in chunks (D1 batch size limit ~100)
  for (let i = 0; i < statements.length; i += D1_BATCH_SIZE) {
    await env.DB.batch(statements.slice(i, i + D1_BATCH_SIZE));
  }

  summary.inserted = toInsert.length;
  summary.updated = toUpdate.length;
  summary.resolved = toResolve.length;
  summary.durationMs = Date.now() - startedAt;

  console.log(
    `[ceb-poller] areas=${summary.areasPolled} fetched=${summary.fetched} ` +
      `new=${summary.inserted} updated=${summary.updated} resolved=${summary.resolved} ` +
      `errors=${summary.errors.length} ${summary.durationMs}ms`,
  );
  if (summary.errors.length > 0) {
    console.warn('[ceb-poller] errors:', summary.errors);
  }

  return summary;
}
