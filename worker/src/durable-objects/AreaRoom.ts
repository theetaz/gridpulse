import type { Env } from '../types/env';

/**
 * One Durable Object per CEB area (we currently use a single "global"
 * instance for v1). Acts as a WebSocket hub for real-time outage
 * updates and tracks a live presence count.
 *
 * IMPORTANT — hibernation API: we use `state.acceptWebSocket` +
 * `state.getWebSockets()` instead of an in-memory session map. An
 * in-memory Map is lost whenever the DO hibernates (which it will
 * aggressively between messages), so tracking sessions there led to
 * the presence count being stuck at 1 regardless of how many clients
 * were actually connected.
 *
 * `state.getWebSockets()` is the canonical source of truth for how
 * many sockets are currently open and survives hibernation correctly.
 */
export class AreaRoom implements DurableObject {
  constructor(
    private state: DurableObjectState,
    _env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade — detect via the Upgrade header instead of
    // path so the DO works regardless of which route forwarded.
    if (request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      // Tell everyone (including the newcomer) the updated count
      this.broadcastPresence();
      return new Response(null, { status: 101, webSocket: client });
    }

    const url = new URL(request.url);

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const data = await request.json<{ type: string; payload: unknown }>();
      this.broadcast(JSON.stringify(data));
      return new Response('ok');
    }

    if (url.pathname === '/stats') {
      return new Response(
        JSON.stringify({ onlineCount: this.state.getWebSockets().length }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    let data: { type?: string; payload?: unknown };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'report':
        this.broadcast(JSON.stringify({ type: 'new_report', payload: data.payload }), ws);
        break;

      case 'confirm':
        this.broadcast(JSON.stringify({ type: 'confirmation', payload: data.payload }), ws);
        break;
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    // During webSocketClose, `state.getWebSockets()` still includes
    // the closing socket — we have to explicitly exclude it or the
    // broadcast ships with the stale pre-close count.
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown) {
    this.broadcastPresence(ws);
  }

  private broadcastPresence(exclude?: WebSocket) {
    const live = this.state
      .getWebSockets()
      .filter(
        (s) => s !== exclude && s.readyState === WebSocket.READY_STATE_OPEN,
      );
    const message = JSON.stringify({ type: 'presence', count: live.length });
    for (const s of live) {
      try {
        s.send(message);
      } catch {
        // Stale socket — will get GC'd next cycle.
      }
    }
  }

  private broadcast(message: string, exclude?: WebSocket) {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      if (ws.readyState !== WebSocket.READY_STATE_OPEN) continue;
      try {
        ws.send(message);
      } catch {
        // Stale socket — will get GC'd on next accept/close cycle
      }
    }
  }
}
