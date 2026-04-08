import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePresenceStore } from '@/stores/presenceStore';

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
  const setOnlineCount = usePresenceStore((s) => s.setOnlineCount);
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
          let data: { type?: string; count?: number } | undefined;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!data?.type) return;

          if (data.type === 'presence' && typeof data.count === 'number') {
            setOnlineCount(data.count);
            return;
          }

          // Any report mutation invalidates the relevant caches. Users
          // see a fresh view within the next render tick.
          if (
            data.type === 'report:created' ||
            data.type === 'report:resolved' ||
            data.type === 'report:deleted' ||
            data.type === 'ceb:updated'
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

    // Cleanly close the socket when the tab is hidden / unloaded so
    // the Durable Object sees the `webSocketClose` event immediately
    // and other clients get a fresh presence count without waiting
    // for a TCP timeout (which can take minutes on mobile).
    //
    // `pagehide` is the most reliable signal across desktop + iOS
    // Safari — it fires on tab close, navigation away, and the
    // bfcache transition. `beforeunload` is a belt-and-braces
    // fallback for browsers that don't fire pagehide reliably.
    const handleGoAway = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.close(1001, 'page hidden');
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('pagehide', handleGoAway);
    window.addEventListener('beforeunload', handleGoAway);

    return () => {
      closedIntentionallyRef.current = true;
      window.removeEventListener('pagehide', handleGoAway);
      window.removeEventListener('beforeunload', handleGoAway);
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [qc, setOnlineCount]);
}
