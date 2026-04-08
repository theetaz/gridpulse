import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Activity,
  Users,
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useIslandAnalytics, useAreaAnalytics, useAreas } from '@/hooks/useAnalytics';
import { formatNumber, formatDuration } from '@/lib/format';

export function StatsPage() {
  const { t } = useTranslation();
  const island = useIslandAnalytics();
  const areas = useAreas();
  const [areaId, setAreaId] = useState<string | null>(null);
  const area = useAreaAnalytics(areaId);

  return (
    <div className="space-y-6 p-4">
      <header>
        <h2 className="text-xl font-bold tracking-tight">{t('stats.title')}</h2>
      </header>

      {/* Island-wide */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide">{t('stats.island_title')}</h3>
        {island.isLoading || !island.data ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <BigStat
                icon={<Activity className="h-4 w-4" />}
                value={formatNumber(island.data.activeOutages)}
                label={t('stats.active_now')}
              />
              <BigStat
                icon={<Users className="h-4 w-4" />}
                value={formatNumber(
                  island.data.customersAffected + island.data.populationAffected,
                )}
                label={t('stats.people_affected')}
              />
            </div>
            <TrendBar
              today={island.data.newToday}
              yesterday={island.data.newYesterday}
              trend={island.data.trend}
              t={t}
            />
            {island.data.worstAreas.length > 0 && (
              <div className="border-border space-y-2 border p-3">
                <h4 className="text-xs font-bold uppercase">{t('stats.worst_areas_title')}</h4>
                <ul className="space-y-1.5">
                  {island.data.worstAreas.map((a) => (
                    <li
                      key={a.areaId}
                      className="flex items-center justify-between text-sm"
                    >
                      <button
                        type="button"
                        className="hover:text-primary text-left"
                        onClick={() => setAreaId(a.areaId)}
                      >
                        {a.areaName}
                      </button>
                      <span className="text-muted-foreground font-mono text-xs">
                        {a.outages}× · {formatNumber(a.customers)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* Area drilldown */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide">
          {t('stats.your_area_title')}
        </h3>
        <select
          className="border-border bg-background w-full border p-2 text-sm"
          value={areaId ?? ''}
          onChange={(e) => setAreaId(e.target.value || null)}
        >
          <option value="">{t('stats.select_area')}</option>
          {areas.data?.areas.map((a) => (
            <option key={a.areaId} value={a.areaId}>
              {a.areaName} {a.activeOutages > 0 ? `(${a.activeOutages} active)` : ''}
            </option>
          ))}
        </select>

        {area.isLoading && areaId ? (
          <Skeleton className="h-40" />
        ) : area.data ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <SmallStat
                icon={<Zap className="h-3.5 w-3.5" />}
                value={formatNumber(area.data.activeOutages)}
                label={t('stats.active_now')}
              />
              <SmallStat
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                value={formatNumber(area.data.outagesLast7Days)}
                label={t('stats.outages_7d')}
              />
              <SmallStat
                icon={<Clock className="h-3.5 w-3.5" />}
                value={
                  area.data.avgDurationMins
                    ? formatDuration(area.data.avgDurationMins)
                    : '—'
                }
                label={t('stats.avg_duration')}
              />
            </div>

            {area.data.outagesLast30Days > 0 ? (
              <div className="border-border border p-3">
                <h4 className="mb-2 text-xs font-bold uppercase">{t('stats.peak_hours')}</h4>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={area.data.hourlyDistribution}>
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h) => `${h}h`}
                      tick={{ fontSize: 10 }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                      contentStyle={{
                        background: 'var(--background)',
                        border: '1px solid var(--border)',
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="count" fill="var(--primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center text-xs">{t('stats.no_data')}</p>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

function BigStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="border-border border p-4">
      <div className="text-muted-foreground flex items-center gap-1 text-[10px] uppercase">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function SmallStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="border-border bg-muted/30 border p-2.5">
      <div className="text-muted-foreground flex items-center gap-1 text-[10px] uppercase">
        {icon}
      </div>
      <div className="mt-1 text-sm font-bold">{value}</div>
      <div className="text-muted-foreground line-clamp-2 text-[9px] leading-tight">{label}</div>
    </div>
  );
}

function TrendBar({
  today,
  yesterday,
  trend,
  t,
}: {
  today: number;
  yesterday: number;
  trend: 'up' | 'down' | 'flat';
  t: (key: string) => string;
}) {
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;
  const color = trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : 'text-muted-foreground';
  return (
    <div className="border-border flex items-center gap-3 border p-3">
      <div className={`flex h-9 w-9 items-center justify-center ${color}`}>
        <Icon className="h-5 w-5" strokeWidth={3} />
      </div>
      <div className="flex-1">
        <p className="text-xs font-bold uppercase">{t(`stats.trend_${trend}`)}</p>
        <p className="text-muted-foreground text-[11px]">
          {today} today · {yesterday} yesterday
        </p>
      </div>
    </div>
  );
}
