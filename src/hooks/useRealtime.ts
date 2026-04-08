import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Opens a WebSocket to the worker's global AreaRoom Durable Object
 * and invalidates relevant TanStack Query caches whenever it receives
 * a realtime event (report:created, report:resolved, report:deleted).
 *
 * Auto-reconnect with exponential backoff on disconnect. Cleans up on
 * unmount. Uses the vite /ws proxy in dev and VITE_API_URL in prod.
 */
export function useRealtime() {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const closedIntentionallyRef = useRef(false);

  useEffect(() => {
    closedIntentionallyRef.current = false;
    let attempt = 0;

    const wsUrlFor = () => {
      const base = import.meta.env.VITE_API_URL ?? '';
      if (base) {
        return base.replace(/^http/, 'ws') + '/ws/global';
      }
      // Same-origin fallback (dev via Vite proxy)
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws/global`;
    };

    const connect = () => {
      if (closedIntentionallyRef.current) return;
      try {
        const ws = new WebSocket(wsUrlFor());
        wsRef.current = ws;

        ws.onopen = () => {
          attempt = 0;
        };

        ws.onmessage = (event) => {
          let data: { type?: string } | undefined;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!data?.type) return;
          // Any report mutation invalidates the relevant caches. Users
          // see a fresh view within the next render tick.
          if (
            data.type === 'report:created' ||
            data.type === 'report:resolved' ||
            data.type === 'report:deleted'
          ) {
            qc.invalidateQueries({ queryKey: ['outages'] });
            qc.invalidateQueries({ queryKey: ['power-status'] });
            qc.invalidateQueries({ queryKey: ['me', 'reports'] });
            qc.invalidateQueries({ queryKey: ['leaderboard'] });
            qc.invalidateQueries({ queryKey: ['analytics'] });
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (closedIntentionallyRef.current) return;
          attempt += 1;
          // Exponential backoff capped at 30s: 1s, 2s, 4s, 8s, 16s, 30s…
          const delay = Math.min(30_000, 1000 * Math.pow(2, attempt - 1));
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // Let onclose handle reconnect.
          ws.close();
        };
      } catch {
        // If constructing the WebSocket itself threw, still schedule a retry.
        attempt += 1;
        const delay = Math.min(30_000, 1000 * Math.pow(2, attempt - 1));
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      closedIntentionallyRef.current = true;
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [qc]);
}
