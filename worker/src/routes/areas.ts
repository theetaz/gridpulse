import { Hono } from 'hono';
import type { Env } from '../types/env';

export const areaRoutes = new Hono<{ Bindings: Env }>();

// GET /api/areas — all CEB areas with current active outage counts
areaRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.area_id, a.area_name, a.province_id, a.province_name,
            a.num_customers,
            COUNT(o.id) AS active_outages,
            COALESCE(SUM(o.num_customers), 0) AS affected_now
       FROM areas a
       LEFT JOIN ceb_outages o
         ON o.area_id = a.area_id AND o.status = 'active'
      GROUP BY a.area_id
      ORDER BY affected_now DESC, a.area_name`,
  ).all<{
    area_id: string;
    area_name: string;
    province_id: string;
    province_name: string | null;
    num_customers: number;
    active_outages: number;
    affected_now: number;
  }>();

  return c.json({
    areas: results.map((r) => ({
      areaId: r.area_id,
      areaName: r.area_name,
      provinceId: r.province_id,
      provinceName: r.province_name,
      totalCustomers: r.num_customers,
      activeOutages: r.active_outages,
      affectedNow: r.affected_now,
    })),
  });
});

// GET /api/areas/:areaId
areaRoutes.get('/:areaId', async (c) => {
  const areaId = c.req.param('areaId');
  const area = await c.env.DB.prepare(
    `SELECT area_id, area_name, province_id, province_name, num_customers, center_lat, center_lon
       FROM areas WHERE area_id = ?`,
  )
    .bind(areaId)
    .first<{
      area_id: string;
      area_name: string;
      province_id: string;
      province_name: string | null;
      num_customers: number;
      center_lat: number | null;
      center_lon: number | null;
    }>();

  if (!area) return c.json({ error: 'area not found' }, 404);

  const active = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(num_customers), 0) AS customers
       FROM ceb_outages WHERE area_id = ? AND status = 'active'`,
  )
    .bind(areaId)
    .first<{ count: number; customers: number }>();

  return c.json({
    areaId: area.area_id,
    areaName: area.area_name,
    provinceId: area.province_id,
    provinceName: area.province_name,
    totalCustomers: area.num_customers,
    centerLat: area.center_lat,
    centerLon: area.center_lon,
    activeOutages: active?.count ?? 0,
    customersAffectedNow: active?.customers ?? 0,
  });
});

// GET /api/areas/:areaId/history
areaRoutes.get('/:areaId/history', async (c) => {
  const areaId = c.req.param('areaId');
  const days = Number(c.req.query('days') ?? 7);

  const { results } = await c.env.DB.prepare(
    `SELECT id, source, source_id, outage_type, num_customers,
            started_at, resolved_at, duration_mins, centroid_lat, centroid_lon
       FROM outage_history
      WHERE area_id = ?
        AND started_at > datetime('now', ?)
      ORDER BY started_at DESC
      LIMIT 200`,
  )
    .bind(areaId, `-${days} days`)
    .all<{
      id: string;
      source: string;
      source_id: string;
      outage_type: string;
      num_customers: number;
      started_at: string;
      resolved_at: string | null;
      duration_mins: number | null;
      centroid_lat: number;
      centroid_lon: number;
    }>();

  return c.json({
    areaId,
    days,
    history: results.map((r) => ({
      id: r.id,
      source: r.source,
      sourceId: r.source_id,
      outageType: r.outage_type,
      numCustomers: r.num_customers,
      startedAt: r.started_at,
      resolvedAt: r.resolved_at,
      durationMins: r.duration_mins,
      centroidLat: r.centroid_lat,
      centroidLon: r.centroid_lon,
    })),
  });
});
