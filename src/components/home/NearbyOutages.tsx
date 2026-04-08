import { useTranslation } from 'react-i18next';
import { useOutages } from '@/hooks/useOutages';
import { useAppStore } from '@/stores/appStore';
import { relativeTime, formatNumber } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap } from 'lucide-react';
import type { CebOutage, CrowdReport } from '@/types/api';

interface Props {
  lat: number | null;
  lon: number | null;
}

export function NearbyOutages({ lat, lon }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useOutages({
    lat: lat ?? undefined,
    lon: lon ?? undefined,
    radiusKm: 15,
  });
  const selectOutage = useAppStore((s) => s.selectOutage);
  const setTab = useAppStore((s) => s.setTab);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const items: Array<{ outage: CebOutage | CrowdReport; key: string }> = [
    ...(data?.ceb ?? []).map((o) => ({ outage: o as CebOutage, key: o.id })),
    ...(data?.crowdsourced ?? []).map((o) => ({ outage: o as CrowdReport, key: o.id })),
  ].slice(0, 5);

  if (items.length === 0) {
    return (
      <div className="border-border bg-muted/30 border p-4 text-center">
        <p className="text-muted-foreground text-xs">{t('home.no_other')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-wide">{t('home.near_you')}</h3>
        <button
          type="button"
          onClick={() => setTab('map')}
          className="text-primary text-[11px] font-medium hover:underline"
        >
          {t('home.see_more')} →
        </button>
      </div>
      {items.map(({ outage, key }) => (
        <button
          type="button"
          key={key}
          onClick={() => selectOutage(outage.id)}
          className="border-border bg-card hover:bg-accent flex w-full items-center gap-3 border p-3 text-left transition"
        >
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center ${
              outage.source === 'ceb' ? 'bg-red-500/10' : 'bg-blue-500/10'
            }`}
          >
            <Zap
              className={`h-4 w-4 ${outage.source === 'ceb' ? 'text-red-500' : 'text-blue-500'}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {outage.areaName ?? ('nearestPlace' in outage ? outage.nearestPlace : null) ?? '—'}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {relativeTime(
                'firstSeenAt' in outage ? outage.firstSeenAt : outage.reportedAt,
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">
              {formatNumber(
                'numCustomers' in outage
                  ? outage.numCustomers
                  : outage.confirmedBy,
              )}
            </p>
            <p className="text-muted-foreground text-[10px]">
              {outage.source === 'ceb'
                ? t('outage.ceb_official')
                : t('outage.crowdsourced')}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
