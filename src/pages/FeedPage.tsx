import { useTranslation } from 'react-i18next';
import { Zap, Inbox } from 'lucide-react';
import { useOutages } from '@/hooks/useOutages';
import { useAppStore } from '@/stores/appStore';
import { Skeleton } from '@/components/ui/skeleton';
import { relativeTime, formatNumber } from '@/lib/format';
import { useLocation } from '@/hooks/useLocation';
import { MyReportsSection } from '@/components/feed/MyReportsSection';
import type { CebOutage, CrowdReport } from '@/types/api';

export function FeedPage() {
  const { t } = useTranslation();
  const { lat, lon } = useLocation();
  const { data, isLoading } = useOutages({
    lat: lat ?? undefined,
    lon: lon ?? undefined,
    radiusKm: 50,
  });
  const selectOutage = useAppStore((s) => s.selectOutage);

  const items: Array<CebOutage | CrowdReport> = [
    ...(data?.ceb ?? []),
    ...(data?.crowdsourced ?? []),
  ].sort((a, b) => {
    const ta = 'firstSeenAt' in a ? a.firstSeenAt : a.reportedAt;
    const tb = 'firstSeenAt' in b ? b.firstSeenAt : b.reportedAt;
    return tb.localeCompare(ta);
  });

  return (
    <div className="space-y-3 p-3">
      <header>
        <h2 className="text-lg font-bold tracking-tight">{t('feed.title')}</h2>
        <p className="text-muted-foreground text-xs">{t('feed.subtitle')}</p>
      </header>

      <MyReportsSection />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="border-border bg-muted/30 flex flex-col items-center gap-2 border p-8 text-center">
          <Inbox className="text-muted-foreground h-10 w-10" />
          <p className="text-sm font-medium">{t('feed.empty_title')}</p>
          <p className="text-muted-foreground text-xs">{t('feed.empty_subtitle')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => selectOutage(o.id)}
                className="border-border bg-card hover:bg-accent flex w-full items-center gap-3 border p-3 text-left transition"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center ${
                    o.source === 'ceb' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                  }`}
                >
                  <Zap className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {o.areaName ?? ('nearestPlace' in o ? o.nearestPlace : null) ?? '—'}
                  </p>
                  <p className="text-muted-foreground truncate text-[11px]">
                    {o.source === 'ceb' ? t(`outage.${o.type}`) : t('outage.user_reported')}
                    {' · '}
                    {relativeTime('firstSeenAt' in o ? o.firstSeenAt : o.reportedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">
                    {formatNumber('numCustomers' in o ? o.numCustomers : o.confirmedBy)}
                  </p>
                  <p className="text-muted-foreground text-[10px] uppercase">
                    {o.source === 'ceb' ? t('outage.ceb_official').split(' ')[0] : 'crowd'}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
