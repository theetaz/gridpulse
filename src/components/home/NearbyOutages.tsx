import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, ChevronDown, Clock, Users, MapPin, Tag } from 'lucide-react';
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
 * Compact, scannable accordion of nearby outages. Collapsed rows are
 * 52px tall. Only one expanded at a time so the list stays short.
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
      <section className="space-y-1.5">
        <SectionHeading t={t} />
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full" />
      </section>
    );
  }

  const items: AnyOutage[] = [
    ...(data?.ceb ?? []),
    ...(data?.crowdsourced ?? []),
  ].slice(0, 6);

  if (items.length === 0) {
    return (
      <section className="space-y-1.5">
        <SectionHeading t={t} />
        <div className="border-border bg-muted/30 border p-4 text-center">
          <p className="text-muted-foreground text-[11px]">{t('home.no_other')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <SectionHeading t={t} />
        <button
          type="button"
          onClick={() => setTab('map')}
          className="text-primary text-[10px] font-medium hover:underline"
        >
          {t('home.see_more')} →
        </button>
      </div>

      <div className="border-border overflow-hidden border">
        {items.map((o, idx) => {
          const isExpanded = expandedId === o.id;
          const startedAt = 'firstSeenAt' in o ? o.firstSeenAt : o.reportedAt;
          const affected = 'numCustomers' in o ? o.numCustomers : o.confirmedBy;
          const name = o.areaName ?? ('nearestPlace' in o ? o.nearestPlace : null) ?? '—';
          const typeKey = o.source === 'ceb' ? o.type : 'user_reported';
          return (
            <OutageRow
              key={o.id}
              name={name}
              startedAt={startedAt}
              affected={affected}
              source={o.source}
              typeLabel={t(`outage.${typeKey}`, { defaultValue: typeKey })}
              expanded={isExpanded}
              showTopBorder={idx > 0}
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

function SectionHeading({ t }: { t: (key: string) => string }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-wider">{t('home.near_you')}</h3>
  );
}

function OutageRow({
  name,
  startedAt,
  affected,
  source,
  typeLabel,
  expanded,
  showTopBorder,
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
  showTopBorder: boolean;
  onToggle: () => void;
  onSeeDetails: () => void;
  onSeeOnMap: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const isCeb = source === 'ceb';
  return (
    <div className={showTopBorder ? 'border-border border-t' : ''}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="hover:bg-accent/50 flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition"
      >
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center ${
            isCeb ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight">{name}</p>
          <p className="text-muted-foreground truncate text-[10px] leading-tight">
            {relativeTime(startedAt)} · {formatNumber(affected)}{' '}
            {affected === 1 ? t('home.affected_one_short') : t('home.affected_other_short')}
          </p>
        </div>
        <span
          className={`shrink-0 text-[8px] font-bold uppercase tracking-wide ${
            isCeb ? 'text-red-500' : 'text-blue-500'
          }`}
        >
          {isCeb ? 'CEB' : t('outage.crowdsourced')}
        </span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="shrink-0"
        >
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-border bg-muted/20 border-t px-3 py-2.5">
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t('outage.started_ago', { time: relativeTime(startedAt) })}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {affected === 1
                    ? t('outage.homes_affected_one', { count: affected })
                    : t('outage.homes_affected_other', { count: affected })}
                </span>
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {typeLabel}
                </span>
              </div>
              <div className="mt-2 flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-[11px]"
                  onClick={onSeeDetails}
                >
                  {t('home.full_details')}
                </Button>
                <Button size="sm" className="h-7 flex-1 text-[11px]" onClick={onSeeOnMap}>
                  <MapPin className="mr-1 h-3 w-3" />
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
