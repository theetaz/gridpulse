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

  // 1. Read what's already in D1 — this is always instant. GeoPop reverse
  //    is fast (local network) so we can await that.
  const [status, place] = await Promise.all([
    analytics.powerStatus(lat, lon, 2),
    geopop.reverse(lat, lon),
  ]);

  // 2. Kick off a background CEB refresh without blocking the response.
  //    When it finishes (possibly slow due to retries / rate-limit
  //    backoff), the 'ceb:updated' broadcast reaches every connected
  //    client through the realtime WebSocket and their TanStack Query
  //    caches are invalidated — the UI updates without reloading.
  c.executionCtx.waitUntil(
    pollAreasNear(c.env, lat, lon, { limit: 3, radiusKm: 20 }).catch((err) => {
      console.warn('[status] background poll failed', err);
    }),
  );

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
