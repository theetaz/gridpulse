import type { Env } from '../types/env';

/**
 * Thin wrapper over the global `AreaRoom` Durable Object for
 * server-initiated realtime broadcasts.
 *
 * Architecture note: for simplicity we use a single "global" room
 * for all clients. Every report create / delete / resolve fans out
 * to everyone connected. For higher scale this can be sharded by
 * area later — the AreaRoom already supports being keyed by id.
 */

const GLOBAL_ROOM = 'global';

export type RealtimeEvent =
  | { type: 'report:created'; id: string; lat: number; lon: number }
  | { type: 'report:resolved'; id: string }
  | { type: 'report:deleted'; id: string }
  | { type: 'ceb:updated'; areaId: string };

export async function broadcast(env: Env, event: RealtimeEvent): Promise<void> {
  try {
    const id = env.AREA_ROOM.idFromName(GLOBAL_ROOM);
    const stub = env.AREA_ROOM.get(id);
    // Fire-and-forget — a broken DO must never break a write path.
    await stub.fetch('https://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: event.type, payload: event }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.warn('[realtime] broadcast failed', err);
  }
}
