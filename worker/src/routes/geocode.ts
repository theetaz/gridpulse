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
