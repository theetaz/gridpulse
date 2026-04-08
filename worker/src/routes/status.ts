import { Hono } from 'hono';
import type { Env } from '../types/env';
import { AnalyticsService } from '../services/analytics.service';
import { GeoPopService } from '../services/geopop.service';
import { pollAreasNear } from '../services/ceb.service';

export const statusRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/status?lat=&lon=
 *
 * Answers "is there power at my place right now?" — used by the Home tab.
 * Combines:
 *   - nearest active outage (CEB or crowd) within 2 km
 *   - GeoPop reverse geocode for the area name
 *   - estimated restoration time from this area's history
 */
statusRoutes.get('/', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lon = Number(c.req.query('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ error: 'lat and lon are required' }, 400);
  }

  const analytics = new AnalyticsService(c.env.DB);
  const geopop = new GeoPopService(c.env.GEOPOP_URL);

  // Refresh the areas near this user in parallel with GeoPop, then
  // compute the status against freshly-reconciled D1 state.
  const [, place] = await Promise.all([
    pollAreasNear(c.env, lat, lon, { limit: 3, radiusKm: 20 }),
    geopop.reverse(lat, lon),
  ]);
  const status = await analytics.powerStatus(lat, lon, 2);

  return c.json({
    coordinates: { lat, lon },
    place: place
      ? {
          name: place.placeName,
          displayName: place.displayName,
          district: place.district,
          province: place.province,
        }
      : null,
    ...status,
  });
});
