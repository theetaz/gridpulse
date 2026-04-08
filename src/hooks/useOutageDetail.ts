import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface OutageDetail {
  id: string;
  source: 'ceb' | 'crowdsourced';
  userId?: string | null;
  reporterName?: string | null;
  isAnonymous?: boolean;
  areaId: string | null;
  areaName: string | null;
  type: string;
  outageTypeId?: number;
  status?: string;
  description?: string | null;
  numCustomers?: number;
  populationAffected?: number | null;
  nearestPlace?: string | null;
  centroidLat: number | null;
  centroidLon: number | null;
  polygon?: Array<{ lat: number; lon: number }>;
  firstSeenAt?: string;
  reportedAt?: string;
  resolvedAt?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  confirmedBy?: number;
  lat?: number;
  lon?: number;
  timestamp?: string | null;
}

export function useOutageDetail(id: string | null) {
  return useQuery({
    queryKey: ['outage', id],
    queryFn: () => api.get<OutageDetail>(`/api/outages/${encodeURIComponent(id!)}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}
