/**
 * Geometry helpers for the map layer.
 */

import type { CebOutage, CrowdReport } from '@/types/api';

type LngLat = [number, number];

/**
 * Chaikin's corner-cutting algorithm — same approach CEB's own UI uses
 * to smooth jagged polygon outlines.
 */
export function chaikin(points: LngLat[], iterations = 3): LngLat[] {
  let result = points;
  for (let i = 0; i < iterations; i++) {
    const next: LngLat[] = [];
    for (let j = 0; j < result.length - 1; j++) {
      const [x1, y1] = result[j];
      const [x2, y2] = result[j + 1];
      next.push([0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2]);
      next.push([0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2]);
    }
    result = next;
  }
  return result;
}

const TYPE_COLORS: Record<string, string> = {
  breakdown: '#ef4444', // red
  demand_management: '#0f172a', // near-black
  planned: '#a855f7', // purple/magenta
};

/**
 * Build GeoJSON FeatureCollections for the map layers.
 *
 * - CEB outages with >1 point → smoothed polygon
 * - CEB outages with 1 point → single Point feature in `cebPoints`
 * - Crowd reports → Point features in `crowdPoints`
 */
export function buildOutageGeoJSON(
  ceb: CebOutage[],
  crowd: CrowdReport[],
) {
  const polygons: GeoJSON.Feature[] = [];
  const cebPoints: GeoJSON.Feature[] = [];

  for (const o of ceb) {
    if (!o.polygon || o.polygon.length === 0) continue;
    const props = {
      id: o.id,
      type: o.type,
      areaName: o.areaName,
      numCustomers: o.numCustomers,
      color: TYPE_COLORS[o.type] ?? '#ef4444',
    };
    if (o.polygon.length === 1) {
      cebPoints.push({
        type: 'Feature',
        properties: props,
        geometry: { type: 'Point', coordinates: [o.polygon[0].lon, o.polygon[0].lat] },
      });
      continue;
    }
    const raw: LngLat[] = o.polygon.map((p) => [p.lon, p.lat]);
    const smoothed = chaikin(raw, 3);
    smoothed.push(smoothed[0]); // close ring
    polygons.push({
      type: 'Feature',
      properties: props,
      geometry: { type: 'Polygon', coordinates: [smoothed] },
    });
  }

  const crowdPoints: GeoJSON.Feature[] = crowd.map((r) => ({
    type: 'Feature',
    properties: {
      id: r.id,
      type: r.type,
      areaName: r.areaName,
      nearestPlace: r.nearestPlace,
      confirmedBy: r.confirmedBy,
    },
    geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
  }));

  return {
    polygons: { type: 'FeatureCollection' as const, features: polygons },
    cebPoints: { type: 'FeatureCollection' as const, features: cebPoints },
    crowdPoints: { type: 'FeatureCollection' as const, features: crowdPoints },
  };
}
