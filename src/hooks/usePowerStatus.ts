import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PowerStatusResponse } from '@/types/api';

export function usePowerStatus(lat: number | null, lon: number | null) {
  return useQuery({
    queryKey: ['power-status', lat, lon],
    queryFn: () => api.get<PowerStatusResponse>(`/api/status?lat=${lat}&lon=${lon}`),
    enabled: lat != null && lon != null,
    refetchInterval: 30_000,
  });
}
