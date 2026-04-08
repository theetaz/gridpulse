#!/usr/bin/env node
/**
 * Polls every CEB area in small batches by hitting the dev-only
 * /__dev/poll-ceb?area=... endpoint on the running wrangler worker.
 *
 * Why batches?  A single full-island poll (45 areas × ~1.5s gap) takes
 * ~70 s of wall time, which exceeds wrangler dev's per-request limit
 * in local mode. Splitting the work into batches of 4-8 areas keeps
 * each HTTP call under the threshold while still letting us cover the
 * whole country.
 *
 * In production, the 30-minute cron trigger calls pollCEBData() directly
 * via ctx.waitUntil(), which has a much larger wall-clock budget and
 * does NOT need this script.
 *
 * Usage (from `worker/`):
 *   node scripts/poll-all.js
 *
 * Requires the worker to already be running (`npm run dev`).
 */

const BASE = process.env.WORKER_URL || 'http://127.0.0.1:8787';
const CHUNK = Number(process.env.CHUNK_SIZE || 6);
const TIMEOUT_MS = Number(process.env.CHUNK_TIMEOUT_MS || 150_000);

// Same 45 area IDs as the seeded `areas` table. In a pinch you can
// query D1 for the live list; hard-coding keeps this script offline.
const AREA_IDS = [
  '01','02','03','04','16','18','19','21','23','24',
  '26','27','30','32','34','36','37','38','39','40',
  '44','48','49','50','52','53','55','56','57','58',
  '59','60','63','64','66','69','71','77','79','80',
  '83','85','87','88','99',
];

async function pollBatch(ids) {
  const url = `${BASE}/__dev/poll-ceb?area=${ids.join(',')}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const totals = { fetched: 0, inserted: 0, updated: 0, resolved: 0, errors: 0 };
  const failingAreas = new Set();

  for (let i = 0; i < AREA_IDS.length; i += CHUNK) {
    const batch = AREA_IDS.slice(i, i + CHUNK);
    const label = `${Math.floor(i / CHUNK) + 1}/${Math.ceil(AREA_IDS.length / CHUNK)}`;
    process.stdout.write(`batch ${label}: ${batch.join(',')} `);
    const start = Date.now();
    try {
      const summary = await pollBatch(batch);
      const dt = ((Date.now() - start) / 1000).toFixed(1);
      totals.fetched += summary.fetched;
      totals.inserted += summary.inserted;
      totals.updated += summary.updated;
      totals.resolved += summary.resolved;
      totals.errors += summary.errors.length;
      for (const e of summary.errors) failingAreas.add(e.areaId);
      console.log(
        `→ fetched=${summary.fetched} new=${summary.inserted} upd=${summary.updated} ` +
          `res=${summary.resolved} err=${summary.errors.length} (${dt}s)`,
      );
    } catch (err) {
      console.log(`→ FAILED: ${err.message || err}`);
      for (const id of batch) failingAreas.add(id);
    }
  }

  console.log();
  console.log('TOTAL:', totals);
  if (failingAreas.size > 0) {
    console.log('Failed areas (retry later):', [...failingAreas].sort().join(','));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
