import { Hono } from 'hono';
import type { Env } from '../types/env';
import { GeoPopService } from '../services/geopop.service';
import { pollAreasNear } from '../services/ceb.service';
import { broadcast } from '../services/realtime.service';
import { boundingBox, haversineKm } from '../utils/geo';

export const outageRoutes = new Hono<{ Bindings: Env }>();

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

interface CebOutageRow {
  id: string;
  area_id: string;
  area_name: string | null;
  outage_type_id: number;
  num_customers: number;
  timestamp: string | null;
  generated_time: string | null;
  start_time: string | null;
  end_time: string | null;
  group_id: string | null;
  interruption_id: string | null;
  interruption_type: string | null;
  polygon: string | null;
  centroid_lat: number | null;
  centroid_lon: number | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
}

interface ReportRow {
  id: string;
  user_id: string | null;
  area_id: string | null;
  area_name: string | null;
  lat: number;
  lon: number;
  type: string;
  status: string;
  description: string | null;
  confirmed_by: number;
  reported_at: string;
  resolved_at: string | null;
  population_affected: number | null;
  nearest_place: string | null;
  linked_ceb_id: string | null;
  is_anonymous: number | null;
  reporter_name: string | null; // joined from users.display_name
}

const FUSION_RADIUS_KM = 0.5;
const DEDUPE_RADIUS_KM = 0.5;
const REPORT_TTL_HOURS = 24;

// Reports this old or older are never shown in "active" views but are
// kept in the DB for the contribution leaderboard + history analytics.
const ACTIVE_REPORT_FILTER =
  "r.status = 'active' AND datetime(r.reported_at) > datetime('now', '-24 hours')";

function deviceId(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('x-device-id') ?? 'anonymous';
}

function deviceName(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const raw = c.req.header('x-device-name');
  return raw ? raw.slice(0, 64) : null;
}

function outageTypeLabel(typeId: number): 'breakdown' | 'demand_management' | 'planned' {
  if (typeId === 1) return 'breakdown';
  if (typeId === 3) return 'demand_management';
  return 'planned';
}

/**
 * Upsert the users row so the leaderboard can show a display name for
 * each device. Called on every report so the name stays fresh.
 */
async function touchUser(env: Env, id: string, name: string | null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, display_name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = COALESCE(excluded.display_name, users.display_name)`,
  )
    .bind(id, name)
    .run();
}

function mapCebRow(r: CebOutageRow) {
  return {
    id: r.id,
    source: 'ceb' as const,
    areaId: r.area_id,
    areaName: r.area_name,
    outageTypeId: r.outage_type_id,
    type: outageTypeLabel(r.outage_type_id),
    numCustomers: r.num_customers,
    timestamp: r.timestamp,
    generatedTime: r.generated_time,
    startTime: r.start_time,
    endTime: r.end_time,
    groupId: r.group_id,
    interruptionId: r.interruption_id,
    interruptionType: r.interruption_type,
    centroidLat: r.centroid_lat,
    centroidLon: r.centroid_lon,
    polygon: r.polygon ? JSON.parse(r.polygon) : [],
    status: r.status,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    resolvedAt: r.resolved_at,
  };
}

function mapReportRow(r: ReportRow) {
  const isAnon = (r.is_anonymous ?? 0) === 1;
  return {
    id: r.id,
    source: 'crowdsourced' as const,
    userId: isAnon ? null : r.user_id,
    reporterName: isAnon ? null : r.reporter_name,
    isAnonymous: isAnon,
    areaId: r.area_id,
    areaName: r.area_name,
    type: r.type,
    status: r.status,
    description: r.description,
    lat: r.lat,
    lon: r.lon,
    centroidLat: r.lat,
    centroidLon: r.lon,
    confirmedBy: r.confirmed_by,
    populationAffected: r.population_affected,
    nearestPlace: r.nearest_place,
    reportedAt: r.reported_at,
    resolvedAt: r.resolved_at,
  };
}

// Shared SELECT expression for reports that joins users for display_name
const REPORT_SELECT = `
  r.id, r.user_id, r.area_id, r.area_name, r.lat, r.lon, r.type, r.status,
  r.description, r.confirmed_by, r.reported_at, r.resolved_at,
  r.population_affected, r.nearest_place, r.linked_ceb_id,
  r.is_anonymous,
  u.display_name AS reporter_name
`;

// ──────────────────────────────────────────────────────────
// GET /api/outages/near?lat=&lon=&radius=
// ──────────────────────────────────────────────────────────

outageRoutes.get('/near', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lon = Number(c.req.query('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ error: 'lat and lon are required' }, 400);
  }
  const radiusKm = Number(c.req.query('radius') ?? 40);
  const limit = Math.min(Number(c.req.query('limit') ?? 5), 10);

  // Background refresh — never blocks the response. When the CEB fetch
  // finishes and the cache actually changes, ceb.service broadcasts a
  // 'ceb:updated' event through the global Durable Object, which the
  // frontend's useRealtime hook catches and invalidates the affected
  // queries. Users see instant D1 data first, then fresh data arrives
  // silently in the background.
  c.executionCtx.waitUntil(
    pollAreasNear(c.env, lat, lon, { limit, radiusKm }).catch((err) => {
      console.warn('[outages/near] background poll failed', err);
    }),
  );

  const bb = boundingBox(lat, lon, radiusKm);
  const { results: cebRows } = await c.env.DB.prepare(
    `SELECT o.id, o.area_id, a.area_name, o.outage_type_id, o.num_customers,
            o.timestamp, o.generated_time, o.start_time, o.end_time,
            o.group_id, o.interruption_id, o.interruption_type,
            o.polygon, o.centroid_lat, o.centroid_lon, o.status,
            o.first_seen_at, o.last_seen_at, o.resolved_at
       FROM ceb_outages o
       LEFT JOIN areas a ON a.area_id = o.area_id
      WHERE o.status = 'active'
        AND o.centroid_lat BETWEEN ? AND ?
        AND o.centroid_lon BETWEEN ? AND ?
      LIMIT 500`,
  )
    .bind(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon)
    .all<CebOutageRow>();

  const { results: reportRows } = await c.env.DB.prepare(
    `SELECT ${REPORT_SELECT}
       FROM reports r
       LEFT JOIN users u ON u.id = r.user_id
      WHERE ${ACTIVE_REPORT_FILTER}
        AND r.linked_ceb_id IS NULL
        AND r.lat BETWEEN ? AND ?
        AND r.lon BETWEEN ? AND ?
      LIMIT 500`,
  )
    .bind(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon)
    .all<ReportRow>();

  return c.json({
    ceb: cebRows.map(mapCebRow),
    crowdsourced: reportRows.map(mapReportRow),
    meta: {
      // Background-fetched, so we don't know the result synchronously.
      // Clients get fresher data through the realtime broadcast.
      backgroundRefresh: true,
    },
  });
});

// ──────────────────────────────────────────────────────────
// GET /api/outages — merged CEB + crowd (read-only cache view)
// ──────────────────────────────────────────────────────────

outageRoutes.get('/', async (c) => {
  const areaId = c.req.query('areaId');
  const status = c.req.query('status') ?? 'active';
  const lat = c.req.query('lat');
  const lon = c.req.query('lon');
  const radiusKm = Number(c.req.query('radius') ?? 50);

  const cebWhere: string[] = ['o.status = ?'];
  const cebBinds: unknown[] = [status];
  if (areaId) {
    cebWhere.push('o.area_id = ?');
    cebBinds.push(areaId);
  }
  if (lat && lon) {
    const bb = boundingBox(Number(lat), Number(lon), radiusKm);
    cebWhere.push('o.centroid_lat BETWEEN ? AND ?');
    cebWhere.push('o.centroid_lon BETWEEN ? AND ?');
    cebBinds.push(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon);
  }

  const { results: cebRows } = await c.env.DB.prepare(
    `SELECT o.id, o.area_id, a.area_name, o.outage_type_id, o.num_customers,
            o.timestamp, o.generated_time, o.start_time, o.end_time,
            o.group_id, o.interruption_id, o.interruption_type,
            o.polygon, o.centroid_lat, o.centroid_lon, o.status,
            o.first_seen_at, o.last_seen_at, o.resolved_at
       FROM ceb_outages o
       LEFT JOIN areas a ON a.area_id = o.area_id
      WHERE ${cebWhere.join(' AND ')}
      ORDER BY o.first_seen_at DESC
      LIMIT 500`,
  )
    .bind(...cebBinds)
    .all<CebOutageRow>();

  const reportWhere: string[] = [ACTIVE_REPORT_FILTER, 'r.linked_ceb_id IS NULL'];
  const reportBinds: unknown[] = [];
  if (areaId) {
    reportWhere.push('r.area_id = ?');
    reportBinds.push(areaId);
  }
  if (lat && lon) {
    const bb = boundingBox(Number(lat), Number(lon), radiusKm);
    reportWhere.push('r.lat BETWEEN ? AND ?');
    reportWhere.push('r.lon BETWEEN ? AND ?');
    reportBinds.push(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon);
  }

  const { results: reportRows } = await c.env.DB.prepare(
    `SELECT ${REPORT_SELECT}
       FROM reports r
       LEFT JOIN users u ON u.id = r.user_id
      WHERE ${reportWhere.join(' AND ')}
      ORDER BY r.reported_at DESC
      LIMIT 500`,
  )
    .bind(...reportBinds)
    .all<ReportRow>();

  return c.json({
    ceb: cebRows.map(mapCebRow),
    crowdsourced: reportRows.map(mapReportRow),
  });
});

// ──────────────────────────────────────────────────────────
// POST /api/outages/report — create crowdsourced report
// ──────────────────────────────────────────────────────────

outageRoutes.post('/report', async (c) => {
  const body = await c.req.json<{
    lat?: number;
    lon?: number;
    type?: 'unplanned' | 'scheduled' | 'restored';
    description?: string;
    isAnonymous?: boolean;
  }>();

  if (typeof body.lat !== 'number' || typeof body.lon !== 'number') {
    return c.json({ error: 'lat and lon are required' }, 400);
  }
  const lat = body.lat;
  const lon = body.lon;
  const type = body.type ?? 'unplanned';
  const description = body.description?.slice(0, 500) ?? null;
  const isAnonymous = body.isAnonymous === true;
  const device = deviceId(c);
  const dName = deviceName(c);

  // 0. Duplicate prevention: reject if this device already has an
  //    active report within DEDUPE_RADIUS_KM in the last 24 h.
  const dedupeBb = boundingBox(lat, lon, DEDUPE_RADIUS_KM);
  const { results: myActive } = await c.env.DB.prepare(
    `SELECT id, lat, lon, reported_at FROM reports
      WHERE user_id = ?
        AND ${ACTIVE_REPORT_FILTER.replace(/r\./g, '')}
        AND lat BETWEEN ? AND ?
        AND lon BETWEEN ? AND ?`,
  )
    .bind(device, dedupeBb.minLat, dedupeBb.maxLat, dedupeBb.minLon, dedupeBb.maxLon)
    .all<{ id: string; lat: number; lon: number; reported_at: string }>();
  for (const row of myActive) {
    const dist = haversineKm(lat, lon, row.lat, row.lon);
    if (dist <= DEDUPE_RADIUS_KM) {
      return c.json(
        {
          error: 'duplicate',
          message: 'You already reported a power cut at this location recently.',
          existingId: row.id,
        },
        409,
      );
    }
  }

  // 1. Enrich in parallel with GeoPop
  const geopop = new GeoPopService(c.env.GEOPOP_URL);
  const [reverse, exposure] = await Promise.all([
    geopop.reverse(lat, lon),
    geopop.exposure(lat, lon, 2),
  ]);

  // 2. Find nearest active CEB outage for fusion (bounding box prefilter)
  const bb = boundingBox(lat, lon, FUSION_RADIUS_KM);
  const { results: nearbyCeb } = await c.env.DB.prepare(
    `SELECT id, area_id, centroid_lat, centroid_lon FROM ceb_outages
      WHERE status = 'active'
        AND centroid_lat BETWEEN ? AND ?
        AND centroid_lon BETWEEN ? AND ?`,
  )
    .bind(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon)
    .all<{ id: string; area_id: string; centroid_lat: number; centroid_lon: number }>();

  let linkedCebId: string | null = null;
  let linkedAreaId: string | null = null;
  let bestDist = FUSION_RADIUS_KM;
  for (const row of nearbyCeb) {
    if (row.centroid_lat == null || row.centroid_lon == null) continue;
    const dist = haversineKm(lat, lon, row.centroid_lat, row.centroid_lon);
    if (dist <= bestDist) {
      bestDist = dist;
      linkedCebId = row.id;
      linkedAreaId = row.area_id;
    }
  }

  // 3. Upsert the user so the leaderboard has their current name
  await touchUser(c.env, device, dName);

  // 4. Insert report
  const reportId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO reports (
       id, user_id, area_id, area_name, lat, lon, type, status,
       description, confirmed_by, reported_at, population_affected,
       nearest_place, linked_ceb_id, is_anonymous
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, datetime('now'), ?, ?, ?, ?)`,
  )
    .bind(
      reportId,
      device,
      linkedAreaId,
      reverse?.displayName ?? null,
      lat,
      lon,
      type,
      description,
      exposure?.totalPopulation ?? null,
      reverse?.placeName ?? null,
      linkedCebId,
      isAnonymous ? 1 : 0,
    )
    .run();

  // 5. If linked, bump the CEB outage's confirmation count
  if (linkedCebId) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO confirmations (outage_id, user_id, confirmed_at)
       VALUES (?, ?, datetime('now'))`,
    )
      .bind(linkedCebId, device)
      .run();
  }

  // 6. Broadcast to connected clients (fire-and-forget)
  void broadcast(c.env, { type: 'report:created', id: reportId, lat, lon });

  return c.json(
    {
      id: reportId,
      lat,
      lon,
      type,
      description,
      nearestPlace: reverse?.placeName ?? null,
      displayName: reverse?.displayName ?? null,
      populationAffected: exposure?.totalPopulation ?? null,
      linkedCebId,
      linkedAreaId,
      fused: linkedCebId !== null,
      isAnonymous,
      reporterName: isAnonymous ? null : dName,
      expiresInHours: REPORT_TTL_HOURS,
    },
    201,
  );
});

// ──────────────────────────────────────────────────────────
// GET /api/outages/:id — single outage detail
// ──────────────────────────────────────────────────────────

outageRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const cebRow = await c.env.DB.prepare(
    `SELECT o.*, a.area_name
       FROM ceb_outages o
       LEFT JOIN areas a ON a.area_id = o.area_id
      WHERE o.id = ?`,
  )
    .bind(id)
    .first<CebOutageRow>();

  if (cebRow) {
    const confirmations = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM confirmations WHERE outage_id = ?`,
    )
      .bind(id)
      .first<{ count: number }>();

    return c.json({
      ...mapCebRow(cebRow),
      confirmedBy: confirmations?.count ?? 0,
    });
  }

  const reportRow = await c.env.DB.prepare(
    `SELECT ${REPORT_SELECT}
       FROM reports r
       LEFT JOIN users u ON u.id = r.user_id
      WHERE r.id = ?`,
  )
    .bind(id)
    .first<ReportRow>();

  if (reportRow) {
    return c.json(mapReportRow(reportRow));
  }

  return c.json({ error: 'not found' }, 404);
});

// ──────────────────────────────────────────────────────────
// POST /api/outages/:id/confirm — upvote an outage
// ──────────────────────────────────────────────────────────

outageRoutes.post('/:id/confirm', async (c) => {
  const id = c.req.param('id');
  const device = deviceId(c);
  const dName = deviceName(c);

  await touchUser(c.env, device, dName);

  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO confirmations (outage_id, user_id, confirmed_at)
     VALUES (?, ?, datetime('now'))`,
  )
    .bind(id, device)
    .run();

  const inserted = (result.meta.changes ?? 0) > 0;
  if (inserted) {
    await c.env.DB.prepare(
      `UPDATE reports SET confirmed_by = confirmed_by + 1 WHERE id = ?`,
    )
      .bind(id)
      .run();
  }

  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM confirmations WHERE outage_id = ?`,
  )
    .bind(id)
    .first<{ count: number }>();

  return c.json({ id, confirmed: inserted, totalConfirmations: count?.count ?? 0 });
});

// ──────────────────────────────────────────────────────────
// POST /api/outages/:id/resolve — owner marks "power's back"
// ──────────────────────────────────────────────────────────

outageRoutes.post('/:id/resolve', async (c) => {
  const id = c.req.param('id');
  const device = deviceId(c);

  const cebRow = await c.env.DB.prepare(`SELECT id, status FROM ceb_outages WHERE id = ?`)
    .bind(id)
    .first<{ id: string; status: string }>();
  if (cebRow) {
    return c.json(
      {
        id,
        error: 'ceb_outage',
        note: 'CEB outages are resolved by the polling engine. Submit a restored-type report instead.',
      },
      409,
    );
  }

  const reportRow = await c.env.DB.prepare(
    `SELECT id, user_id, status, lat, lon, area_id FROM reports WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; user_id: string | null; status: string; lat: number; lon: number; area_id: string | null }>();

  if (!reportRow) return c.json({ error: 'not found' }, 404);
  if (reportRow.user_id !== device) {
    return c.json({ error: 'forbidden', message: 'Only the reporter can resolve this entry.' }, 403);
  }
  if (reportRow.status === 'resolved') return c.json({ id, alreadyResolved: true });

  const resolvedAt = new Date().toISOString();
  const historyId = crypto.randomUUID();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE reports SET status = 'resolved', resolved_at = ? WHERE id = ?`,
    ).bind(resolvedAt, id),
    c.env.DB.prepare(
      `INSERT INTO outage_history (
         id, source, source_id, area_id, outage_type, num_customers,
         started_at, resolved_at, duration_mins, centroid_lat, centroid_lon
       )
       SELECT ?, 'crowdsourced', id, area_id, type, confirmed_by,
              reported_at, ?,
              CAST((julianday(?) - julianday(reported_at)) * 1440 AS INTEGER),
              lat, lon
         FROM reports WHERE id = ?`,
    ).bind(historyId, resolvedAt, resolvedAt, id),
  ]);

  void broadcast(c.env, { type: 'report:resolved', id });

  return c.json({ id, resolvedAt });
});

// ──────────────────────────────────────────────────────────
// DELETE /api/outages/:id — owner deletes their report (soft delete)
// ──────────────────────────────────────────────────────────

outageRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const device = deviceId(c);

  const reportRow = await c.env.DB.prepare(
    `SELECT id, user_id, status FROM reports WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; user_id: string | null; status: string }>();

  if (!reportRow) return c.json({ error: 'not found' }, 404);
  if (reportRow.user_id !== device) {
    return c.json({ error: 'forbidden', message: 'Only the reporter can delete this entry.' }, 403);
  }
  if (reportRow.status === 'deleted') return c.json({ id, alreadyDeleted: true });

  await c.env.DB.prepare(
    `UPDATE reports SET status = 'deleted', resolved_at = datetime('now') WHERE id = ?`,
  )
    .bind(id)
    .run();

  void broadcast(c.env, { type: 'report:deleted', id });

  return c.json({ id, deleted: true });
});
