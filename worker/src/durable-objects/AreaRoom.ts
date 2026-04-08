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
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      this.sessions.set(server, {});
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const data = await request.json<{ type: string; payload: unknown }>();
      this.broadcast(JSON.stringify(data));
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
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
  }

  async webSocketError(ws: WebSocket) {
    this.sessions.delete(ws);
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
