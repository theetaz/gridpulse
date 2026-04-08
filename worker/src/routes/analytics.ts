import { Hono } from 'hono';
import type { Env } from '../types/env';
import { AnalyticsService } from '../services/analytics.service';

export const analyticsRoutes = new Hono<{ Bindings: Env }>();

// GET /api/analytics/island
analyticsRoutes.get('/island', async (c) => {
  const svc = new AnalyticsService(c.env.DB);
  return c.json(await svc.island());
});

// GET /api/analytics/:areaId
analyticsRoutes.get('/:areaId', async (c) => {
  const areaId = c.req.param('areaId');
  const svc = new AnalyticsService(c.env.DB);
  const data = await svc.area(areaId);
  if (!data) return c.json({ error: 'area not found' }, 404);
  return c.json(data);
});
