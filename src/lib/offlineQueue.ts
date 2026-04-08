/**
 * Offline queue for crowdsourced reports.
 *
 * If the user submits a report while offline (or the worker is unreachable),
 * we drop the payload into IndexedDB and try again whenever the browser
 * comes back online.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { api, ApiError } from '@/lib/api';
import type { ReportCreateResponse } from '@/types/api';

const DB_NAME = 'gridpulse-offline';
const STORE = 'pending-reports';

interface PendingReport {
  id: string;
  body: {
    lat: number;
    lon: number;
    type: string;
    description?: string;
    isAnonymous?: boolean;
  };
  queuedAt: number;
}

async function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function queueReport(body: PendingReport['body']): Promise<void> {
  const handle = await db();
  await handle.put(STORE, {
    id: crypto.randomUUID(),
    body,
    queuedAt: Date.now(),
  });
}

export async function pendingReports(): Promise<PendingReport[]> {
  const handle = await db();
  return (await handle.getAll(STORE)) as PendingReport[];
}

export async function drainQueue(): Promise<{ sent: number; failed: number }> {
  const handle = await db();
  const all = (await handle.getAll(STORE)) as PendingReport[];
  let sent = 0;
  let failed = 0;
  for (const item of all) {
    try {
      await api.post<ReportCreateResponse>('/api/outages/report', item.body);
      await handle.delete(STORE, item.id);
      sent++;
    } catch (err) {
      // Stop on first network error so we don't hammer the server
      if (!(err instanceof ApiError)) {
        failed++;
        break;
      }
      // 4xx → drop the report (it's malformed and would never succeed)
      if (err.status >= 400 && err.status < 500) {
        await handle.delete(STORE, item.id);
        failed++;
      } else {
        failed++;
        break;
      }
    }
  }
  return { sent, failed };
}

/**
 * Submit a report, falling back to the offline queue if the network call
 * fails. Returns null on queued, the API response on success.
 */
export async function submitReportResilient(
  body: PendingReport['body'],
): Promise<ReportCreateResponse | null> {
  try {
    return await api.post<ReportCreateResponse>('/api/outages/report', body);
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      // Real client error — don't queue
      throw err;
    }
    await queueReport(body);
    return null;
  }
}

let listenerInstalled = false;

export function installOfflineSync(onDrain?: (result: { sent: number; failed: number }) => void) {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;
  const handler = async () => {
    if (!navigator.onLine) return;
    const result = await drainQueue();
    if (result.sent > 0) onDrain?.(result);
  };
  window.addEventListener('online', handler);
  // Drain on app startup too
  void handler();
}
