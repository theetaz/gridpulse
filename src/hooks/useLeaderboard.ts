import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  displayName: string;
  totalReports: number;
  activeNow: number;
  resolved: number;
  lastReportedAt: string | null;
}

export function useLeaderboard(limit = 20) {
  return useQuery({
    queryKey: ['leaderboard', limit],
    queryFn: () => api.get<{ leaders: LeaderboardRow[] }>(`/api/leaderboard?limit=${limit}`),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
