import { Hono } from 'hono';
import type { Env } from '../types/env';
import { GeoPopService } from '../services/geopop.service';
import { pollAreasNear } from '../services/ceb.service';
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
}

const FUSION_RADIUS_KM = 0.5; // link a crowd report to a CEB outage if within 500 m

function deviceId(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('x-device-id') ?? 'anonymous';
}

function outageTypeLabel(typeId: number): 'breakdown' | 'demand_management' | 'planned' {
  if (typeId === 1) return 'breakdown';
  if (typeId === 3) return 'demand_management';
  return 'planned';
}

// ──────────────────────────────────────────────────────────
// GET /api/outages/near?lat=&lon=&radius=
//
// Lazy cache-first entrypoint used by the frontend whenever it needs
// fresh outages for "near me". We:
//   1. Find the N closest CEB areas by centroid (within radius)
//   2. For each, call pollArea() — D1 cache-hit or single CEB fetch
//   3. Return the freshened merged (CEB + crowd) view
//
// This is the ONLY path that causes CEB traffic. All other endpoints
// read from D1 only.
// ──────────────────────────────────────────────────────────

outageRoutes.get('/near', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lon = Number(c.req.query('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ error: 'lat and lon are required' }, 400);
  }
  const radiusKm = Number(c.req.query('radius') ?? 40);
  const limit = Math.min(Number(c.req.query('limit') ?? 5), 10);

  // 1. Refresh the nearest areas (cache-aware)
  const pollResults = await pollAreasNear(c.env, lat, lon, { limit, radiusKm });

  // 2. Read merged outages that intersect the requested region
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

  const ceb = cebRows.map((r) => ({
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
  }));

  const { results: reportRows } = await c.env.DB.prepare(
    `SELECT id, area_id, area_name, lat, lon, type, status, description,
            confirmed_by, reported_at, resolved_at, population_affected,
            nearest_place, linked_ceb_id
       FROM reports
      WHERE status = 'active' AND linked_ceb_id IS NULL
        AND lat BETWEEN ? AND ?
        AND lon BETWEEN ? AND ?
      LIMIT 500`,
  )
    .bind(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon)
    .all<ReportRow>();

  const crowdsourced = reportRows.map((r) => ({
    id: r.id,
    source: 'crowdsourced' as const,
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
  }));

  return c.json({
    ceb,
    crowdsourced,
    meta: {
      polledAreas: pollResults.map((r) => ({
        areaId: r.areaId,
        cached: r.cached,
        outageCount: r.outageCount,
        error: r.error,
      })),
      cached: pollResults.every((r) => r.cached),
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

  // CEB outages
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

  const cebSql = `
    SELECT o.id, o.area_id, a.area_name, o.outage_type_id, o.num_customers,
           o.timestamp, o.generated_time, o.start_time, o.end_time,
           o.group_id, o.interruption_id, o.interruption_type,
           o.polygon, o.centroid_lat, o.centroid_lon, o.status,
           o.first_seen_at, o.last_seen_at, o.resolved_at
      FROM ceb_outages o
      LEFT JOIN areas a ON a.area_id = o.area_id
     WHERE ${cebWhere.join(' AND ')}
     ORDER BY o.first_seen_at DESC
     LIMIT 500
  `;
  const { results: cebRows } = await c.env.DB.prepare(cebSql)
    .bind(...cebBinds)
    .all<CebOutageRow>();

  const ceb = cebRows.map((r) => ({
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
  }));

  // Crowd reports — show everything active that's NOT already linked to
  // a CEB outage (those get represented via the CEB row's confirmed_by).
  const reportWhere: string[] = ["r.status = 'active'", 'r.linked_ceb_id IS NULL'];
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

  const reportSql = `
    SELECT r.id, r.area_id, r.area_name, r.lat, r.lon, r.type, r.status,
           r.description, r.confirmed_by, r.reported_at, r.resolved_at,
           r.population_affected, r.nearest_place, r.linked_ceb_id
      FROM reports r
     WHERE ${reportWhere.join(' AND ')}
     ORDER BY r.reported_at DESC
     LIMIT 500
  `;
  const { results: reportRows } = await c.env.DB.prepare(reportSql)
    .bind(...reportBinds)
    .all<ReportRow>();

  const crowdsourced = reportRows.map((r) => ({
    id: r.id,
    source: 'crowdsourced' as const,
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
  }));

  return c.json({ ceb, crowdsourced });
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
  }>();

  if (typeof body.lat !== 'number' || typeof body.lon !== 'number') {
    return c.json({ error: 'lat and lon are required' }, 400);
  }
  const lat = body.lat;
  const lon = body.lon;
  const type = body.type ?? 'unplanned';
  const description = body.description?.slice(0, 500) ?? null;
  const device = deviceId(c);

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

  // 3. Insert report
  const reportId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO reports (
       id, user_id, area_id, area_name, lat, lon, type, status,
       description, confirmed_by, reported_at, population_affected,
       nearest_place, linked_ceb_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, datetime('now'), ?, ?, ?)`,
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
    )
    .run();

  // 4. If linked, bump the CEB outage's confirmation count via confirmations table
  if (linkedCebId) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO confirmations (outage_id, user_id, confirmed_at)
       VALUES (?, ?, datetime('now'))`,
    )
      .bind(linkedCebId, device)
      .run();
  }

  return c.json({
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
  }, 201);
});

// ──────────────────────────────────────────────────────────
// GET /api/outages/:id — single outage detail
// ──────────────────────────────────────────────────────────

outageRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  // Try CEB first
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
      id: cebRow.id,
      source: 'ceb',
      areaId: cebRow.area_id,
      areaName: cebRow.area_name,
      type: outageTypeLabel(cebRow.outage_type_id),
      outageTypeId: cebRow.outage_type_id,
      numCustomers: cebRow.num_customers,
      timestamp: cebRow.timestamp,
      startTime: cebRow.start_time,
      endTime: cebRow.end_time,
      centroidLat: cebRow.centroid_lat,
      centroidLon: cebRow.centroid_lon,
      polygon: cebRow.polygon ? JSON.parse(cebRow.polygon) : [],
      status: cebRow.status,
      firstSeenAt: cebRow.first_seen_at,
      resolvedAt: cebRow.resolved_at,
      confirmedBy: confirmations?.count ?? 0,
    });
  }

  // Otherwise try reports
  const reportRow = await c.env.DB.prepare(
    `SELECT * FROM reports WHERE id = ?`,
  )
    .bind(id)
    .first<ReportRow>();

  if (reportRow) {
    return c.json({
      id: reportRow.id,
      source: 'crowdsourced',
      areaId: reportRow.area_id,
      areaName: reportRow.area_name,
      type: reportRow.type,
      status: reportRow.status,
      description: reportRow.description,
      lat: reportRow.lat,
      lon: reportRow.lon,
      centroidLat: reportRow.lat,
      centroidLon: reportRow.lon,
      confirmedBy: reportRow.confirmed_by,
      populationAffected: reportRow.population_affected,
      nearestPlace: reportRow.nearest_place,
      reportedAt: reportRow.reported_at,
      resolvedAt: reportRow.resolved_at,
    });
  }

  return c.json({ error: 'not found' }, 404);
});

// ──────────────────────────────────────────────────────────
// POST /api/outages/:id/confirm — upvote an outage
// ──────────────────────────────────────────────────────────

outageRoutes.post('/:id/confirm', async (c) => {
  const id = c.req.param('id');
  const device = deviceId(c);

  // Dedupe via (report_id, user_id) PK
  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO confirmations (outage_id, user_id, confirmed_at)
     VALUES (?, ?, datetime('now'))`,
  )
    .bind(id, device)
    .run();

  const inserted = (result.meta.changes ?? 0) > 0;

  // If this was a crowd report, bump its confirmed_by count
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
// POST /api/outages/:id/resolve — mark as "power's back!"
// ──────────────────────────────────────────────────────────

outageRoutes.post('/:id/resolve', async (c) => {
  const id = c.req.param('id');

  // Resolving a CEB outage is authoritative (it replaces ground truth),
  // so require at least 3 crowd signals agreeing. For a crowd report,
  // the first resolve wins.
  const cebRow = await c.env.DB.prepare(
    `SELECT id, status FROM ceb_outages WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; status: string }>();

  if (cebRow) {
    if (cebRow.status !== 'active') {
      return c.json({ id, alreadyResolved: true });
    }
    // Keep CEB as ground truth; do not flip status here.
    // Instead count this as a confirmation-of-resolution via a separate
    // report of type='restored'.
    return c.json(
      {
        id,
        note: 'CEB outages are resolved by the polling engine. Submit a restored-type report instead.',
      },
      409,
    );
  }

  const reportRow = await c.env.DB.prepare(
    `SELECT id, status, lat, lon, area_id FROM reports WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; status: string; lat: number; lon: number; area_id: string | null }>();

  if (!reportRow) return c.json({ error: 'not found' }, 404);
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

  return c.json({ id, resolvedAt });
});
