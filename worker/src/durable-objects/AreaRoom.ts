import type { Env } from '../types/env';

type Session = { userId?: string };

/**
 * One Durable Object per CEB area. Acts as a WebSocket hub for
 * real-time outage updates within that area.
 *
 * Routes:
 *   GET  /ws         → upgrade to WebSocket
 *   POST /broadcast  → server-to-server fan-out (called by cron poller)
 */
export class AreaRoom implements DurableObject {
  private sessions = new Map<WebSocket, Session>();

  constructor(
    private state: DurableObjectState,
    _env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade — detect via the Upgrade header instead of
    // the path so the DO works regardless of which route the Worker
    // forwarded from.
    if (request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      this.sessions.set(server, {});
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
      return new Response(JSON.stringify({ onlineCount: this.sessions.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404 });
  }

  private broadcastPresence() {
    const msg = JSON.stringify({ type: 'presence', count: this.sessions.size });
    this.broadcast(msg);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    const data = JSON.parse(message) as { type: string; payload?: unknown; userId?: string };

    switch (data.type) {
      case 'identify':
        this.sessions.set(ws, { userId: data.userId });
        ws.send(
          JSON.stringify({
            type: 'state',
            payload: (await this.state.storage.get('currentOutages')) ?? [],
          }),
        );
        break;

      case 'report':
        this.broadcast(JSON.stringify({ type: 'new_report', payload: data.payload }), ws);
        break;

      case 'confirm':
        this.broadcast(JSON.stringify({ type: 'confirmation', payload: data.payload }), ws);
        break;
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.sessions.delete(ws);
    this.broadcastPresence();
  }

  async webSocketError(ws: WebSocket) {
    this.sessions.delete(ws);
    this.broadcastPresence();
  }

  private broadcast(message: string, exclude?: WebSocket) {
    for (const [ws] of this.sessions) {
      if (ws !== exclude && ws.readyState === WebSocket.READY_STATE_OPEN) {
        try {
          ws.send(message);
        } catch {
          this.sessions.delete(ws);
        }
      }
    }
  }
}
