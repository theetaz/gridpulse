import { boundingBox, haversineKm } from '../utils/geo';

/**
 * Aggregations and rollups for the analytics + home/status endpoints.
 *
 * All queries are written to be cheap on D1 — we lean on indexes and
 * keep result sets small. Heavier reports should move to a precomputed
 * snapshot table later.
 */
export class AnalyticsService {
  constructor(private readonly db: D1Database) {}

  /**
   * Island-wide live snapshot — what's happening right now and how it
   * compares to the same window yesterday.
   */
  async island() {
    // Active CEB outages
    const ceb = await this.db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(num_customers), 0) AS customers
           FROM ceb_outages WHERE status = 'active'`,
      )
      .first<{ count: number; customers: number }>();

    // Active independent crowd reports (not linked to CEB)
    const crowd = await this.db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(population_affected), 0) AS population
           FROM reports WHERE status = 'active' AND linked_ceb_id IS NULL`,
      )
      .first<{ count: number; population: number }>();

    // Trend: outages that started in the last 24h vs the prior 24h
    const today = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM outage_history
          WHERE started_at > datetime('now', '-1 day')`,
      )
      .first<{ count: number }>();

    const yesterday = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM outage_history
          WHERE started_at BETWEEN datetime('now', '-2 days') AND datetime('now', '-1 day')`,
      )
      .first<{ count: number }>();

    // Worst-affected areas right now
    const { results: worstAreas } = await this.db
      .prepare(
        `SELECT o.area_id, a.area_name,
                COUNT(*) AS outages,
                SUM(o.num_customers) AS customers
           FROM ceb_outages o
           LEFT JOIN areas a ON a.area_id = o.area_id
          WHERE o.status = 'active'
          GROUP BY o.area_id
          ORDER BY customers DESC
          LIMIT 5`,
      )
      .all<{ area_id: string; area_name: string | null; outages: number; customers: number }>();

    const todayCount = today?.count ?? 0;
    const yesterdayCount = yesterday?.count ?? 0;

    return {
      activeOutages: (ceb?.count ?? 0) + (crowd?.count ?? 0),
      cebOutages: ceb?.count ?? 0,
      crowdReports: crowd?.count ?? 0,
      customersAffected: ceb?.customers ?? 0,
      populationAffected: crowd?.population ?? 0,
      newToday: todayCount,
      newYesterday: yesterdayCount,
      trend: trendLabel(todayCount, yesterdayCount),
      trendDelta: todayCount - yesterdayCount,
      worstAreas: worstAreas.map((a) => ({
        areaId: a.area_id,
        areaName: a.area_name,
        outages: a.outages,
        customers: a.customers,
      })),
    };
  }

  /**
   * Per-area analytics — used by the Stats tab and the area detail screen.
   */
  async area(areaId: string) {
    const area = await this.db
      .prepare(`SELECT area_id, area_name, province_name, num_customers FROM areas WHERE area_id = ?`)
      .bind(areaId)
      .first<{ area_id: string; area_name: string; province_name: string | null; num_customers: number }>();
    if (!area) return null;

    const active = await this.db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(num_customers), 0) AS customers
           FROM ceb_outages WHERE area_id = ? AND status = 'active'`,
      )
      .bind(areaId)
      .first<{ count: number; customers: number }>();

    const last7d = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM outage_history
          WHERE area_id = ? AND started_at > datetime('now', '-7 days')`,
      )
      .bind(areaId)
      .first<{ count: number }>();

    const last30d = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM outage_history
          WHERE area_id = ? AND started_at > datetime('now', '-30 days')`,
      )
      .bind(areaId)
      .first<{ count: number }>();

    const avgDuration = await this.db
      .prepare(
        `SELECT AVG(duration_mins) AS avg
           FROM outage_history
          WHERE area_id = ? AND duration_mins > 0
            AND started_at > datetime('now', '-90 days')`,
      )
      .bind(areaId)
      .first<{ avg: number | null }>();

    // Peak hours over the last 30 days
    const { results: peakHours } = await this.db
      .prepare(
        `SELECT CAST(strftime('%H', started_at) AS INTEGER) AS hour, COUNT(*) AS count
           FROM outage_history
          WHERE area_id = ? AND started_at > datetime('now', '-30 days')
          GROUP BY hour
          ORDER BY hour`,
      )
      .bind(areaId)
      .all<{ hour: number; count: number }>();

    // Hourly distribution as a 24-slot array (for charts)
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: peakHours.find((p) => p.hour === h)?.count ?? 0,
    }));

    return {
      areaId: area.area_id,
      areaName: area.area_name,
      provinceName: area.province_name,
      totalCustomers: area.num_customers,
      activeOutages: active?.count ?? 0,
      customersAffectedNow: active?.customers ?? 0,
      outagesLast7Days: last7d?.count ?? 0,
      outagesLast30Days: last30d?.count ?? 0,
      avgDurationMins: avgDuration?.avg ? Math.round(avgDuration.avg) : null,
      hourlyDistribution: hourly,
    };
  }

  /**
   * "Is there power at my place?" — finds the nearest active outage to
   * a coordinate within a small radius. Returns null if none.
   */
  async powerStatus(lat: number, lon: number, radiusKm = 2) {
    const bb = boundingBox(lat, lon, radiusKm);

    // Try CEB first (more authoritative)
    const { results: cebRows } = await this.db
      .prepare(
        `SELECT o.id, o.area_id, a.area_name, o.outage_type_id, o.num_customers,
                o.centroid_lat, o.centroid_lon, o.first_seen_at, o.timestamp
           FROM ceb_outages o
           LEFT JOIN areas a ON a.area_id = o.area_id
          WHERE o.status = 'active'
            AND o.centroid_lat BETWEEN ? AND ?
            AND o.centroid_lon BETWEEN ? AND ?`,
      )
      .bind(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon)
      .all<{
        id: string;
        area_id: string;
        area_name: string | null;
        outage_type_id: number;
        num_customers: number;
        centroid_lat: number;
        centroid_lon: number;
        first_seen_at: string;
        timestamp: string | null;
      }>();

    let nearest: {
      id: string;
      source: 'ceb' | 'crowdsourced';
      areaId: string | null;
      areaName: string | null;
      type: string;
      affected: number;
      startedAt: string;
      distanceKm: number;
    } | null = null;
    let bestDist = Infinity;

    for (const row of cebRows) {
      const d = haversineKm(lat, lon, row.centroid_lat, row.centroid_lon);
      if (d < bestDist) {
        bestDist = d;
        nearest = {
          id: row.id,
          source: 'ceb',
          areaId: row.area_id,
          areaName: row.area_name,
          type: row.outage_type_id === 1 ? 'breakdown' : row.outage_type_id === 3 ? 'demand_management' : 'planned',
          affected: row.num_customers,
          startedAt: row.first_seen_at,
          distanceKm: Number(d.toFixed(2)),
        };
      }
    }

    // If no CEB match, also check independent crowd reports
    if (!nearest) {
      const { results: crowdRows } = await this.db
        .prepare(
          `SELECT id, area_id, area_name, type, lat, lon, reported_at, confirmed_by, population_affected
             FROM reports
            WHERE status = 'active' AND linked_ceb_id IS NULL
              AND lat BETWEEN ? AND ?
              AND lon BETWEEN ? AND ?`,
        )
        .bind(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon)
        .all<{
          id: string;
          area_id: string | null;
          area_name: string | null;
          type: string;
          lat: number;
          lon: number;
          reported_at: string;
          confirmed_by: number;
          population_affected: number | null;
        }>();

      for (const row of crowdRows) {
        const d = haversineKm(lat, lon, row.lat, row.lon);
        if (d < bestDist) {
          bestDist = d;
          nearest = {
            id: row.id,
            source: 'crowdsourced',
            areaId: row.area_id,
            areaName: row.area_name,
            type: row.type,
            affected: row.confirmed_by,
            startedAt: row.reported_at,
            distanceKm: Number(d.toFixed(2)),
          };
        }
      }
    }

    if (!nearest) {
      return { status: 'powered' as const, nearest: null, estRestoreMins: null };
    }

    // Estimated restoration from this area's historical avg
    let estRestoreMins: number | null = null;
    if (nearest.areaId) {
      const avg = await this.db
        .prepare(
          `SELECT AVG(duration_mins) AS avg
             FROM outage_history
            WHERE area_id = ? AND duration_mins > 0
              AND started_at > datetime('now', '-90 days')`,
        )
        .bind(nearest.areaId)
        .first<{ avg: number | null }>();
      if (avg?.avg) estRestoreMins = Math.round(avg.avg);
    }

    return { status: 'outage' as const, nearest, estRestoreMins };
  }
}

function trendLabel(today: number, yesterday: number): 'up' | 'down' | 'flat' {
  if (today > yesterday * 1.1) return 'up';
  if (today < yesterday * 0.9) return 'down';
  return 'flat';
}
