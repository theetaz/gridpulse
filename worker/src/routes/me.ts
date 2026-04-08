import { Hono } from 'hono';
import type { Env } from '../types/env';

export const meRoutes = new Hono<{ Bindings: Env }>();

function deviceId(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('x-device-id') ?? 'anonymous';
}

/**
 * GET /api/me/reports
 *
 * Every report submitted by the current device, active-first.
 * Used by the "My reports" view so the user can see what they've
 * contributed and act on their own entries (resolve / delete).
 *
 * We include the last 24 h of active reports + any resolved/deleted
 * reports from the last 7 days so the user has context on their
 * contribution history without the list growing forever.
 */
meRoutes.get('/reports', async (c) => {
  const device = deviceId(c);

  const { results } = await c.env.DB.prepare(
    `SELECT id, area_id, area_name, lat, lon, type, status, description,
            confirmed_by, reported_at, resolved_at, population_affected,
            nearest_place, linked_ceb_id
       FROM reports
      WHERE user_id = ?
        AND (
          (status = 'active' AND datetime(reported_at) > datetime('now', '-24 hours'))
          OR (status IN ('resolved','deleted') AND datetime(reported_at) > datetime('now', '-7 days'))
        )
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END,
        reported_at DESC
      LIMIT 200`,
  )
    .bind(device)
    .all<{
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
    }>();

  return c.json({
    reports: results.map((r) => ({
      id: r.id,
      areaId: r.area_id,
      areaName: r.area_name,
      lat: r.lat,
      lon: r.lon,
      type: r.type,
      status: r.status,
      description: r.description,
      confirmedBy: r.confirmed_by,
      reportedAt: r.reported_at,
      resolvedAt: r.resolved_at,
      populationAffected: r.population_affected,
      nearestPlace: r.nearest_place,
      linkedCebId: r.linked_ceb_id,
    })),
  });
});
