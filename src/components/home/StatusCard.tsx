import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Zap, ZapOff, Clock, Users, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocation } from '@/hooks/useLocation';
import { usePowerStatus } from '@/hooks/usePowerStatus';
import { useAppStore } from '@/stores/appStore';
import { relativeTime, formatDistance, formatDuration, formatNumber } from '@/lib/format';

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
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  const isOut = data.status === 'outage';
  const nearest = data.nearest;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`border-border relative overflow-hidden border p-5 ${
        isOut ? 'bg-red-500/5' : 'bg-green-500/5'
      }`}
    >
      {/* Status badge */}
      <div className="flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center ${
            isOut ? 'bg-red-500' : 'bg-green-500'
          } text-white`}
        >
          {isOut ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
            {source === 'manual' ? t('home.place_label_manual') : t('home.place_label')}
          </p>
          <p className="text-xs font-medium">{placeName ?? data.place?.name ?? '—'}</p>
        </div>
      </div>

      <h2 className="mt-4 text-2xl font-bold tracking-tight">
        {isOut ? t('home.outage_title') : t('home.powered_title')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {isOut && nearest
          ? t('home.outage_subtitle', { distance: formatDistance(nearest.distanceKm) })
          : t('home.powered_subtitle')}
      </p>

      {isOut && nearest && (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Stat
              icon={<Clock className="h-3.5 w-3.5" />}
              value={relativeTime(nearest.startedAt)}
              label={t('home.started', { time: '' })}
            />
            <Stat
              icon={<Users className="h-3.5 w-3.5" />}
              value={formatNumber(nearest.affected)}
              label={t('home.affected_other', { count: nearest.affected })}
            />
            <Stat
              icon={<Zap className="h-3.5 w-3.5" />}
              value={
                data.estRestoreMins
                  ? formatDuration(data.estRestoreMins)
                  : t('home.no_estimate')
              }
              label={t('home.est_back', { duration: '' })}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => selectOutage(nearest.id)}
          >
            {t('outage.see_on_map')}
          </Button>
        </>
      )}

      {!isOut && (
        <Button variant="outline" size="sm" className="mt-5 w-full" onClick={openReport}>
          {t('home.report_button')}
        </Button>
      )}
    </motion.div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="border-border bg-background/60 border p-2.5">
      <div className="text-muted-foreground flex items-center gap-1 text-[10px] uppercase">
        {icon}
      </div>
      <div className="mt-1 line-clamp-1 text-sm font-bold">{value}</div>
      <div className="text-muted-foreground line-clamp-1 text-[10px]">{label}</div>
    </div>
  );
}
