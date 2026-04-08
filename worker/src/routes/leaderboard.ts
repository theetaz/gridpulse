import { Hono } from 'hono';
import type { Env } from '../types/env';

export const leaderboardRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/leaderboard
 *
 * Top contributors ranked by total reports ever submitted (not just
 * active ones — deleted and resolved reports still count, so people
 * who clean up their entries aren't penalized).
 */
leaderboardRoutes.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);

  const { results } = await c.env.DB.prepare(
    `SELECT r.user_id,
            COALESCE(u.display_name, 'Anonymous') as display_name,
            COUNT(r.id) AS total_reports,
            SUM(CASE WHEN r.status = 'active'
                      AND datetime(r.reported_at) > datetime('now', '-24 hours')
                     THEN 1 ELSE 0 END) AS active_now,
            SUM(CASE WHEN r.status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
            MAX(r.reported_at) AS last_reported_at
       FROM reports r
       LEFT JOIN users u ON u.id = r.user_id
      WHERE r.user_id IS NOT NULL AND r.user_id != 'anonymous'
      GROUP BY r.user_id
      HAVING total_reports > 0
      ORDER BY total_reports DESC, last_reported_at DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all<{
      user_id: string;
      display_name: string | null;
      total_reports: number;
      active_now: number;
      resolved: number;
      last_reported_at: string | null;
    }>();

  return c.json({
    leaders: results.map((r, idx) => ({
      rank: idx + 1,
      userId: r.user_id,
      displayName: r.display_name ?? 'Anonymous',
      totalReports: r.total_reports,
      activeNow: r.active_now,
      resolved: r.resolved,
      lastReportedAt: r.last_reported_at,
    })),
  });
});
