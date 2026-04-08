import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { IslandStats, AreaStats, AreaSummary } from '@/types/api';

export function useIslandAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'island'],
    queryFn: () => api.get<IslandStats>('/api/analytics/island'),
    refetchInterval: 60_000,
  });
}

export function useAreaAnalytics(areaId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'area', areaId],
    queryFn: () => api.get<AreaStats>(`/api/analytics/${areaId}`),
    enabled: !!areaId,
  });
}

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: () => api.get<{ areas: AreaSummary[] }>('/api/areas'),
    staleTime: 5 * 60_000,
  });
}
