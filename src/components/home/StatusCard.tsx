import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Zap, ZapOff, Clock, Users, Timer, MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocation } from '@/hooks/useLocation';
import type { GeoErrorReason } from '@/hooks/useGeolocation';
import { usePowerStatus } from '@/hooks/usePowerStatus';
import { useAppStore } from '@/stores/appStore';
import { relativeTime, formatDistance, formatDuration, formatNumber } from '@/lib/format';

/**
 * The single most important UI element in the app — answers
 * "is my power on or off?" the moment the user opens the app.
 *
 * Design intent: tight but readable. Compact padding, small headline
 * (text-xl), single inline meta row instead of stacked stat rows, and
 * one unambiguous primary CTA button at the bottom. No truncation —
 * the old 3-column stat grid was the source of every ellipsis on real
 * phones, so it's gone.
 */
export function StatusCard() {
  const { t } = useTranslation();
  const {
    lat,
    lon,
    error: geoError,
    errorReason: geoReason,
    loading: geoLoading,
    refresh,
    source,
    placeName,
  } = useLocation();
  const { data, isLoading } = usePowerStatus(lat, lon);
  const openReport = useAppStore((s) => s.openReportSheet);
  const selectOutage = useAppStore((s) => s.selectOutage);

  // Surface a toast the first time we see a given error reason. Using
  // a ref (not state) so we don't re-render on dedupe, and keying the
  // toast id on the reason so repeated refreshes with the same error
  // replace the toast instead of stacking them.
  const lastToastedReason = useRef<GeoErrorReason | null>(null);
  useEffect(() => {
    if (!geoReason) {
      lastToastedReason.current = null;
      return;
    }
    if (lastToastedReason.current === geoReason) return;
    lastToastedReason.current = geoReason;
    toast.error(t(`home.geo_error_${geoReason}_title`), {
      id: `geo-${geoReason}`,
      description: t(`home.geo_error_${geoReason}_body`),
      duration: 8000,
    });
  }, [geoReason, t]);

  if (geoError) {
    const reason: GeoErrorReason = geoReason ?? 'unavailable';
    // Only 'unsupported' and 'insecure' are terminal — the rest can
    // be recovered by user action, so we show the retry button.
    const canRetry = reason !== 'unsupported' && reason !== 'insecure';
    return (
      <div className="border-border bg-muted/30 border p-4 text-center">
        <MapPin className="text-muted-foreground mx-auto h-6 w-6" />
        <p className="mt-2 text-xs font-bold">
          {t(`home.geo_error_${reason}_title`)}
        </p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-[18rem] text-[11px] leading-snug">
          {t(`home.geo_error_${reason}_body`)}
        </p>
        {canRetry && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 h-7 px-3 text-[11px]"
            onClick={refresh}
          >
            {t('home.location_retry')}
          </Button>
        )}
        <p className="text-muted-foreground mt-3 text-[10px]">
          {t('home.geo_pick_city_hint')}
        </p>
      </div>
    );
  }

  if (geoLoading || lat == null || lon == null || isLoading || !data) {
    return (
      <div className="border-border space-y-2 border p-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-10 w-full" />
      </div>
    );
  }

  const isOut = data.status === 'outage';
  const nearest = data.nearest;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`border-border relative overflow-hidden border ${
        isOut ? 'bg-red-500/5' : 'bg-emerald-500/5'
      }`}
    >
      {/* Top: status icon + place label */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center ${
            isOut ? 'bg-red-500' : 'bg-emerald-500'
          } text-white`}
        >
          {isOut ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
        </div>
        <div className="min-w-0 text-right">
          <p className="text-muted-foreground text-[9px] uppercase tracking-wide leading-none">
            {source === 'manual' ? t('home.place_label_manual') : t('home.place_label')}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium">
            {placeName ?? data.place?.name ?? '—'}
          </p>
        </div>
      </div>

      {/* Headline + subtitle */}
      <div className="px-4 pt-2.5">
        <h2 className="text-xl font-bold leading-tight tracking-tight">
          {isOut ? t('home.outage_title') : t('home.powered_title')}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {isOut && nearest
            ? t('home.outage_subtitle', { distance: formatDistance(nearest.distanceKm) })
            : t('home.powered_subtitle')}
        </p>
      </div>

      {/* Inline meta row — three chips in one line, never truncates because
          the values are short (relative time, count, duration) */}
      {isOut && nearest && (
        <div className="text-muted-foreground flex items-center gap-3 px-4 pt-2.5 text-[11px]">
          <MetaChip icon={<Clock className="h-3 w-3" />} value={relativeTime(nearest.startedAt) || '—'} />
          <MetaChip
            icon={<Users className="h-3 w-3" />}
            value={`${formatNumber(nearest.affected)} ${nearest.affected === 1 ? t('home.affected_one_short') : t('home.affected_other_short')}`}
          />
          <MetaChip
            icon={<Timer className="h-3 w-3" />}
            value={data.estRestoreMins ? formatDuration(data.estRestoreMins) : '—'}
          />
        </div>
      )}

      {/* Primary CTA */}
      <div className="px-4 pb-3 pt-3">
        <Button
          size="sm"
          className={`h-10 w-full text-sm font-bold ${
            isOut ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-primary text-primary-foreground'
          }`}
          onClick={openReport}
        >
          {isOut ? (
            <>
              <AlertTriangle className="mr-1.5 h-4 w-4" />
              {t('home.cta_power_out_too')}
            </>
          ) : (
            <>
              <ZapOff className="mr-1.5 h-4 w-4" />
              {t('home.cta_report_power_cut')}
            </>
          )}
        </Button>

        {isOut && nearest && (
          <div className="mt-2 flex items-center justify-between text-[10px]">
            <div className="text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span>{t('home.neighbors_confirmed', { count: nearest.affected })}</span>
            </div>
            <button
              type="button"
              className="text-primary font-medium hover:underline"
              onClick={() => selectOutage(nearest.id)}
            >
              {t('home.see_details')} →
            </button>
          </div>
        )}
      </div>
    </motion.section>
  );
}

function MetaChip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}
