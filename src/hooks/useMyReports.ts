import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface MyReport {
  id: string;
  areaId: string | null;
  areaName: string | null;
  lat: number;
  lon: number;
  type: string;
  status: 'active' | 'resolved' | 'deleted' | string;
  description: string | null;
  confirmedBy: number;
  reportedAt: string;
  resolvedAt: string | null;
  populationAffected: number | null;
  nearestPlace: string | null;
  linkedCebId: string | null;
}

export function useMyReports() {
  return useQuery({
    queryKey: ['me', 'reports'],
    queryFn: () => api.get<{ reports: MyReport[] }>(`/api/me/reports`),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

export function useResolveMyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ id: string; resolvedAt?: string }>(`/api/outages/${id}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'reports'] });
      qc.invalidateQueries({ queryKey: ['outages'] });
      qc.invalidateQueries({ queryKey: ['power-status'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useDeleteMyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; deleted: boolean }>(`/api/outages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'reports'] });
      qc.invalidateQueries({ queryKey: ['outages'] });
      qc.invalidateQueries({ queryKey: ['power-status'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}
