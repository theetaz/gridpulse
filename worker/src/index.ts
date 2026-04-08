import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { outageRoutes } from './routes/outages';
import { areaRoutes } from './routes/areas';
import { analyticsRoutes } from './routes/analytics';
import { statusRoutes } from './routes/status';
import { geocodeRoutes } from './routes/geocode';
import { meRoutes } from './routes/me';
import { leaderboardRoutes } from './routes/leaderboard';
import { pollCEBData } from './cron/ceb-poller';

export { AreaRoom } from './durable-objects/AreaRoom';

const app = new Hono<{ Bindings: Env }>();

// CORS allowlist: localhost dev, the canonical Pages domain, any
// *.pages.dev preview (per-deployment branches), and a reserved
// custom domain. Using a function lets us accept previews like
// https://4ea80583.gridpulse-cyr.pages.dev without listing every one.
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (origin === 'http://localhost:5173' || origin === 'http://localhost:5174') return origin;
      if (origin === 'https://gridpulse.lk') return origin;
      if (/^https:\/\/([a-z0-9-]+\.)?gridpulse-cyr\.pages\.dev$/.test(origin)) return origin;
      return null;
    },
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
app.route('/api/me', meRoutes);
app.route('/api/leaderboard', leaderboardRoutes);

// WebSocket upgrade → Durable Object (one room per CEB area).
//
// IMPORTANT: we forward the RAW Request (c.req.raw) rather than
// constructing a new one. Building a new Request with just headers
// drops the Cloudflare-internal WebSocket upgrade metadata, and the
// DO never gets a proper upgrade — the socket never opens and the
// presence broadcast never reaches the client.
app.get('/ws/:areaId', async (c) => {
  const upgrade = c.req.header('upgrade');
  if (upgrade !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }
  const areaId = c.req.param('areaId');
  const id = c.env.AREA_ROOM.idFromName(areaId);
  const stub = c.env.AREA_ROOM.get(id);
  return stub.fetch(c.req.raw);
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
