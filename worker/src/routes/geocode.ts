import { Hono } from 'hono';
import type { Env } from '../types/env';
import { GeoPopService } from '../services/geopop.service';

export const geocodeRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/geocode/search?q=kandy
 *
 * Thin proxy to GeoPop's /cities/search, scoped to Sri Lanka.
 * Used by the frontend location search so we don't need to expose
 * the GeoPop URL directly to the browser.
 */
geocodeRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ results: [] });

  const limit = Math.min(Number(c.req.query('limit') ?? 8), 20);
  const geopop = new GeoPopService(c.env.GEOPOP_URL);
  const results = await geopop.searchCities(q, limit);
  return c.json({ results });
});

/**
 * GET /api/geocode/reverse?lat=6.9271&lon=79.8612
 *
 * Lightweight reverse geocode, used by the map-pin-point location picker
 * so the user sees a live place name update as they drag the crosshair.
 */
geocodeRoutes.get('/reverse', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lon = Number(c.req.query('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ error: 'lat and lon are required' }, 400);
  }
  const geopop = new GeoPopService(c.env.GEOPOP_URL);
  const place = await geopop.reverse(lat, lon);
  if (!place) return c.json({ place: null });
  return c.json({
    place: {
      name: place.placeName,
      displayName: place.displayName,
      district: place.district,
      province: place.province,
    },
  });
});
