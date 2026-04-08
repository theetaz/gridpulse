import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, ChevronDown, Clock, Users, MapPin, CheckCircle2 } from 'lucide-react';
import { useOutages } from '@/hooks/useOutages';
import { useAppStore } from '@/stores/appStore';
import { relativeTime, formatNumber } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { CebOutage, CrowdReport } from '@/types/api';

interface Props {
  lat: number | null;
  lon: number | null;
}

type AnyOutage = CebOutage | CrowdReport;

/**
 * Collapsible list of nearby outages. Collapsed = 1-line summary
 * (area, time, count). Tap any row to expand in-place and reveal
 * type, confirmations, and jump-to-map actions. Only one row open
 * at a time so the list stays scannable.
 */
export function NearbyOutages({ lat, lon }: Props) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useOutages({
    lat: lat ?? undefined,
    lon: lon ?? undefined,
    radiusKm: 15,
  });
  const selectOutage = useAppStore((s) => s.selectOutage);
  const setTab = useAppStore((s) => s.setTab);

  if (isLoading) {
    return (
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide">{t('home.near_you')}</h3>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </section>
    );
  }

  const items: AnyOutage[] = [
    ...(data?.ceb ?? []),
    ...(data?.crowdsourced ?? []),
  ].slice(0, 6);

  if (items.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide">{t('home.near_you')}</h3>
        <div className="border-border bg-muted/30 border p-5 text-center">
          <p className="text-muted-foreground text-xs">{t('home.no_other')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
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

      <div className="space-y-1.5">
        {items.map((o) => {
          const isExpanded = expandedId === o.id;
          const startedAt = 'firstSeenAt' in o ? o.firstSeenAt : o.reportedAt;
          const affected = 'numCustomers' in o ? o.numCustomers : o.confirmedBy;
          const name = o.areaName ?? ('nearestPlace' in o ? o.nearestPlace : null) ?? '—';
          const typeKey =
            o.source === 'ceb'
              ? o.type
              : 'user_reported';
          return (
            <OutageRow
              key={o.id}
              name={name}
              startedAt={startedAt}
              affected={affected}
              source={o.source}
              typeLabel={t(`outage.${typeKey}`, { defaultValue: typeKey })}
              expanded={isExpanded}
              onToggle={() => setExpandedId(isExpanded ? null : o.id)}
              onSeeDetails={() => selectOutage(o.id)}
              onSeeOnMap={() => {
                setTab('map');
                selectOutage(o.id);
              }}
              t={t}
            />
          );
        })}
      </div>
    </section>
  );
}

function OutageRow({
  name,
  startedAt,
  affected,
  source,
  typeLabel,
  expanded,
  onToggle,
  onSeeDetails,
  onSeeOnMap,
  t,
}: {
  name: string;
  startedAt: string;
  affected: number;
  source: 'ceb' | 'crowdsourced';
  typeLabel: string;
  expanded: boolean;
  onToggle: () => void;
  onSeeDetails: () => void;
  onSeeOnMap: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const isCeb = source === 'ceb';
  return (
    <div className="border-border bg-card overflow-hidden border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="hover:bg-accent/60 flex w-full items-center gap-3 p-3 text-left transition"
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center ${
            isCeb ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
          }`}
        >
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{name}</p>
          <p className="text-muted-foreground truncate text-[11px]">
            {relativeTime(startedAt)} · {formatNumber(affected)}
            {affected === 1 ? ` ${t('home.affected_one_short')}` : ` ${t('home.affected_other_short')}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={`inline-block text-[9px] font-bold uppercase tracking-wide ${
              isCeb ? 'text-red-500' : 'text-blue-500'
            }`}
          >
            {isCeb ? t('outage.ceb_official') : t('outage.crowdsourced')}
          </span>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-border space-y-2 border-t p-3">
              <DetailRow
                icon={<Clock className="h-3.5 w-3.5" />}
                label={t('outage.started_ago', { time: relativeTime(startedAt) })}
              />
              <DetailRow
                icon={<Users className="h-3.5 w-3.5" />}
                label={
                  affected === 1
                    ? t('outage.homes_affected_one', { count: affected })
                    : t('outage.homes_affected_other', { count: affected })
                }
              />
              <DetailRow
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label={typeLabel}
              />

              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={onSeeDetails}>
                  {t('home.full_details')}
                </Button>
                <Button size="sm" className="flex-1" onClick={onSeeOnMap}>
                  <MapPin className="mr-1 h-3.5 w-3.5" />
                  {t('outage.see_on_map')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
      {icon}
      <span>{label}</span>
    </div>
  );
}
