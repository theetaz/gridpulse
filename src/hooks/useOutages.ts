import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OutagesResponse } from '@/types/api';

interface UseOutagesOptions {
  lat?: number | null;
  lon?: number | null;
  radiusKm?: number;
  limit?: number;
  refetchMs?: number;
  enabled?: boolean;
}

/**
 * Fetches outages near a location. Hits the lazy /api/outages/near
 * endpoint, which transparently caches CEB data in D1 for 10 minutes
 * and only re-fetches from CEB when a user actually needs fresh data.
 *
 * Without lat/lon the hook stays disabled — we refuse to ask for
 * "all outages everywhere", which would be the opposite of lazy.
 */
export function useOutages(opts: UseOutagesOptions = {}) {
  const { lat, lon, radiusKm = 40, limit = 5, refetchMs = 2 * 60_000, enabled = true } = opts;
  const hasLocation = lat != null && lon != null;
  return useQuery({
    queryKey: ['outages', 'near', lat, lon, radiusKm, limit],
    queryFn: () =>
      api.get<OutagesResponse & { meta?: { cached: boolean; polledAreas: unknown[] } }>(
        `/api/outages/near?lat=${lat}&lon=${lon}&radius=${radiusKm}&limit=${limit}`,
      ),
    enabled: enabled && hasLocation,
    refetchInterval: refetchMs,
    staleTime: 30_000,
  });
}
