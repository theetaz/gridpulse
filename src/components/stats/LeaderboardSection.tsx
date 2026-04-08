import { useTranslation } from 'react-i18next';
import { Trophy, Medal, Crown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { getDeviceId } from '@/lib/profile';
import { relativeTime } from '@/lib/format';

/**
 * Contribution leaderboard. Every successfully submitted report (even
 * resolved or deleted ones) counts toward the total, so cleaning up
 * your entries doesn't hurt your rank.
 */
export function LeaderboardSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useLeaderboard(15);
  const me = getDeviceId();

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-wider">
          {t('stats.leaderboard_title')}
        </h3>
        <span className="text-muted-foreground text-[10px]">
          {t('stats.leaderboard_subtitle')}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data || data.leaders.length === 0 ? (
        <div className="border-border bg-muted/30 border p-4 text-center">
          <Trophy className="text-muted-foreground mx-auto h-6 w-6" />
          <p className="text-muted-foreground mt-1.5 text-[11px]">
            {t('stats.leaderboard_empty')}
          </p>
        </div>
      ) : (
        <ol className="border-border overflow-hidden border">
          {data.leaders.map((row, idx) => {
            const isMe = row.userId === me;
            return (
              <li
                key={row.userId}
                className={`flex items-center gap-2.5 px-3 py-2 ${
                  idx > 0 ? 'border-border border-t' : ''
                } ${isMe ? 'bg-primary/10' : ''}`}
              >
                <RankBadge rank={row.rank} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">
                    {row.displayName}
                    {isMe && (
                      <span className="text-primary ml-1.5 text-[9px] uppercase tracking-wide">
                        {t('stats.you')}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-[10px] leading-tight">
                    {row.lastReportedAt ? relativeTime(row.lastReportedAt) : ''}
                    {row.activeNow > 0 && (
                      <span className="ml-1 text-red-500">· {row.activeNow} active</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold leading-none">{row.totalReports}</p>
                  <p className="text-muted-foreground text-[9px] uppercase">
                    {row.totalReports === 1 ? t('stats.report_one') : t('stats.report_other')}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-amber-400 text-black">
        <Crown className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-slate-300 text-black">
        <Medal className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-amber-700 text-white">
        <Medal className="h-3.5 w-3.5" />
      </div>
    );
  }
  return (
    <div className="border-border text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center border text-[11px] font-bold">
      {rank}
    </div>
  );
}
