import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Zap, ZapOff, Clock, Users, Timer, MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocation } from '@/hooks/useLocation';
import { usePowerStatus } from '@/hooks/usePowerStatus';
import { useAppStore } from '@/stores/appStore';
import { relativeTime, formatDistance, formatDuration, formatNumber } from '@/lib/format';

/**
 * The single most important UI element in the app — answers "is my
 * power on or off?" the moment the user opens the app.
 *
 * Design choices:
 *  - One large, unambiguous statement (big heading, full-color background)
 *  - Full-width context rows with icon prefixes instead of a cramped
 *    multi-column stat grid (prior version truncated "Restoratio...",
 *    "1 homes...", "33 minutes..." at real mobile widths)
 *  - One primary CTA that dominates the card. Context-aware label:
 *    "My power is out too" when an outage is detected nearby,
 *    "Report a power cut" when things look fine. Either way, it opens
 *    the report drawer pre-filled with the current location, and the
 *    fusion logic on the server handles the "confirm vs new" decision.
 *  - Subtle social proof ("1 neighbor confirmed") reminds users their
 *    contribution is not in a void.
 */
export function StatusCard() {
  const { t } = useTranslation();
  const { lat, lon, error: geoError, loading: geoLoading, refresh, source, placeName } = useLocation();
  const { data, isLoading } = usePowerStatus(lat, lon);
  const openReport = useAppStore((s) => s.openReportSheet);
  const selectOutage = useAppStore((s) => s.selectOutage);

  if (geoError) {
    return (
      <div className="border-border bg-muted/30 border p-6 text-center">
        <MapPin className="text-muted-foreground mx-auto h-8 w-8" />
        <p className="mt-3 text-sm font-medium">{t('home.location_error')}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={refresh}>
          {t('home.location_retry')}
        </Button>
      </div>
    );
  }

  if (geoLoading || lat == null || lon == null || isLoading || !data) {
    return (
      <div className="border-border space-y-3 border p-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-4 h-12 w-full" />
      </div>
    );
  }

  const isOut = data.status === 'outage';
  const nearest = data.nearest;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`border-border relative overflow-hidden border ${
        isOut ? 'bg-red-500/5' : 'bg-emerald-500/5'
      }`}
    >
      {/* Top strip: status icon + place name */}
      <div className="flex items-start justify-between p-5 pb-3">
        <div
          className={`flex h-12 w-12 items-center justify-center ${
            isOut ? 'bg-red-500' : 'bg-emerald-500'
          } text-white`}
        >
          {isOut ? <ZapOff className="h-6 w-6" /> : <Zap className="h-6 w-6" />}
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
            {source === 'manual' ? t('home.place_label_manual') : t('home.place_label')}
          </p>
          <p className="mt-0.5 max-w-[12rem] truncate text-xs font-medium">
            {placeName ?? data.place?.name ?? '—'}
          </p>
        </div>
      </div>

      {/* Big statement */}
      <div className="px-5 pb-4">
        <h2 className="text-3xl font-bold leading-tight tracking-tight">
          {isOut ? t('home.outage_title') : t('home.powered_title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {isOut && nearest
            ? t('home.outage_subtitle', { distance: formatDistance(nearest.distanceKm) })
            : t('home.powered_subtitle')}
        </p>
      </div>

      {/* Context rows — full width, never truncate */}
      {isOut && nearest && (
        <div className="border-border space-y-0 border-t border-b">
          <ContextRow
            icon={<Clock className="h-4 w-4" />}
            label={t('home.started')}
            value={relativeTime(nearest.startedAt) || '—'}
          />
          <ContextRow
            icon={<Users className="h-4 w-4" />}
            label={
              nearest.affected === 1
                ? t('home.affected_one', { count: nearest.affected })
                : t('home.affected_other', { count: nearest.affected })
            }
            value={formatNumber(nearest.affected)}
          />
          <ContextRow
            icon={<Timer className="h-4 w-4" />}
            label={t('home.est_back_label')}
            value={
              data.estRestoreMins ? formatDuration(data.estRestoreMins) : t('home.no_estimate')
            }
          />
        </div>
      )}

      {/* Primary CTA — huge and unambiguous */}
      <div className="p-5 pt-4">
        <Button
          size="lg"
          className={`h-14 w-full text-base font-bold ${
            isOut
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-primary text-primary-foreground'
          }`}
          onClick={openReport}
        >
          {isOut ? (
            <>
              <AlertTriangle className="mr-2 h-5 w-5" />
              {t('home.cta_power_out_too')}
            </>
          ) : (
            <>
              <ZapOff className="mr-2 h-5 w-5" />
              {t('home.cta_report_power_cut')}
            </>
          )}
        </Button>

        {isOut && nearest && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <div className="text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
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

function ContextRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-3 last:border-b-0">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
