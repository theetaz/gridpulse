import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { outageRoutes } from './routes/outages';
import { areaRoutes } from './routes/areas';
import { analyticsRoutes } from './routes/analytics';
import { statusRoutes } from './routes/status';
import { geocodeRoutes } from './routes/geocode';
import { pollCEBData } from './cron/ceb-poller';

export { AreaRoom } from './durable-objects/AreaRoom';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: ['https://gridpulse.lk', 'http://localhost:5173'],
  }),
);

// Surface unhandled errors so we can debug them in dev. In production this
// should be replaced with a proper logger / Sentry, but echoing the message
// is more useful than wrangler's silent 500s.
app.onError((err, c) => {
  console.error('[error]', err);
  return c.json(
    {
      error: err.message ?? 'Internal Server Error',
      stack: err.stack?.split('\n').slice(0, 5),
    },
    500,
  );
});

app.get('/', (c) => c.json({ name: 'gridpulse-api', status: 'ok' }));

// Dev-only manual trigger for the CEB poller. Lets you test the cron path
// without waiting 5 minutes. Pass `?area=02,04` to scope the poll to a
// subset of areas — handy for staying under CEB's per-IP rate limit while
// iterating locally.
app.post('/__dev/poll-ceb', async (c) => {
  const areaParam = c.req.query('area');
  const areaIds = areaParam ? areaParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const summary = await pollCEBData(c.env, { areaIds });
  return c.json(summary);
});

app.route('/api/outages', outageRoutes);
app.route('/api/areas', areaRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/status', statusRoutes);
app.route('/api/geocode', geocodeRoutes);

// WebSocket upgrade → Durable Object (one room per CEB area)
app.get('/ws/:areaId', async (c) => {
  const areaId = c.req.param('areaId');
  const id = c.env.AREA_ROOM.idFromName(areaId);
  const room = c.env.AREA_ROOM.get(id);
  return room.fetch(
    new Request('https://internal/ws', {
      headers: c.req.raw.headers,
    }),
  );
});

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(pollCEBData(env));
  },

  // async queue(batch: MessageBatch, env: Env) {
  //   for (const msg of batch.messages) {
  //     // TODO: send web push
  //     msg.ack();
  //   }
  // },
};
