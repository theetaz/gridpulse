import type { RawCEBCluster, ParsedOutage } from '../types/ceb';

const NULL_DATE = '0001-01-01T00:00:00';

/**
 * CEB /Incognito/* endpoints return a double-JSON-encoded string —
 * the body is a JSON string whose value is itself a JSON-encoded array.
 * Empty areas return an empty string ("") rather than "[]".
 */
export function parseDoubleEncoded<T = unknown>(raw: string): T[] {
  if (!raw || raw === '""') return [];
  const first = JSON.parse(raw);
  if (typeof first === 'string') {
    if (!first) return [];
    return JSON.parse(first) as T[];
  }
  return first as T[];
}

// Browser-ish UA so we look like the CEB web portal rather than a bot.
// CEB's /Incognito/* endpoints are publicly served to that portal, so
// matching its fingerprint avoids the WAF/rate-limit hot path.
const BROWSER_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Referer: 'https://cebcare.ceb.lk/Incognito/OutageMap',
  'X-Requested-With': 'XMLHttpRequest',
} as const;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;

/**
 * Fetch outage clusters for a single CEB area.
 *
 * - 15s per-request timeout (CEB endpoints sometimes hang)
 * - Up to 4 attempts with exponential backoff + jitter
 * - Honors Retry-After on 429
 * - Distinguishes transient (retryable) from permanent (give up)
 */
export async function fetchAreaOutages(
  cebBaseUrl: string,
  areaId: string,
): Promise<RawCEBCluster[]> {
  const url = `${cebBaseUrl}/Incognito/GetOutageLocationsInArea?areaId=${encodeURIComponent(areaId)}`;

  let lastError = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) {
        lastError = 'HTTP 429';
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        // 2s, 4s, 8s, 16s baseline + up to 1s jitter
        const backoff = retryAfter ?? 1000 * Math.pow(2, attempt + 1);
        await sleep(Math.min(backoff, 20_000) + Math.random() * 1000);
        continue;
      }

      if (res.status >= 500 && res.status < 600) {
        lastError = `HTTP ${res.status}`;
        await sleep(1000 * Math.pow(2, attempt) + Math.random() * 500);
        continue;
      }

      if (!res.ok) {
        // Client error (404 etc) — don't retry
        throw new Error(`CEB ${url} → HTTP ${res.status}`);
      }

      const text = await res.text();
      return parseDoubleEncoded<RawCEBCluster>(text);
    } catch (err) {
      clearTimeout(timer);
      // AbortError (timeout) or network error → retry
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      if (attempt === MAX_ATTEMPTS - 1) break;
      await sleep(1000 * Math.pow(2, attempt) + Math.random() * 500);
    }
  }

  throw new Error(`CEB ${url} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute the arithmetic centroid of a polygon's points. Sufficient
 * for our use case (clustering / map markers); we don't need a true
 * geometric centroid for irregular polygons.
 */
export function computeCentroid(points: Array<{ Lat: number; Lon: number }>): {
  lat: number;
  lon: number;
} {
  if (points.length === 0) return { lat: 0, lon: 0 };
  if (points.length === 1) return { lat: points[0].Lat, lon: points[0].Lon };
  let sumLat = 0;
  let sumLon = 0;
  for (const p of points) {
    sumLat += p.Lat;
    sumLon += p.Lon;
  }
  return { lat: sumLat / points.length, lon: sumLon / points.length };
}

/**
 * Build a deterministic ID for an outage cluster based on its
 * area + type + centroid (rounded to ~10m precision).
 *
 * CEB does not expose stable cluster IDs, so we fingerprint on
 * geometry. Drift greater than ~10m results in a new outage row,
 * which is acceptable for our purposes.
 */
export function makeOutageId(
  areaId: string,
  outageTypeId: number,
  centroidLat: number,
  centroidLon: number,
): string {
  return `${areaId}_${outageTypeId}_${centroidLat.toFixed(4)}_${centroidLon.toFixed(4)}`;
}

function nullIfDefault(value: string | undefined | null): string | null {
  if (!value) return null;
  if (value === NULL_DATE) return null;
  return value;
}

/**
 * Normalize a raw CEB cluster into our internal shape.
 */
export function parseCluster(raw: RawCEBCluster, areaId: string): ParsedOutage {
  const { lat, lon } = computeCentroid(raw.Points);
  return {
    id: makeOutageId(areaId, raw.OutageTypeId, lat, lon),
    areaId,
    outageTypeId: raw.OutageTypeId,
    numCustomers: raw.NumberOfCustomers ?? 0,
    timestamp: nullIfDefault(raw.TimeStamp),
    generatedTime: nullIfDefault(raw.GeneratedTime),
    startTime: nullIfDefault(raw.StartTime),
    endTime: nullIfDefault(raw.EndTime),
    groupId: raw.GroupId ?? null,
    interruptionId: raw.InterruptionId ?? null,
    interruptionType: raw.InterruptionTypeName ?? null,
    polygon: raw.Points.map((p) => ({ lat: p.Lat, lon: p.Lon })),
    centroidLat: lat,
    centroidLon: lon,
  };
}
