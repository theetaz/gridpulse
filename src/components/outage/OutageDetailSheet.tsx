import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Users, CheckCircle2, MapPin } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useOutageDetail } from '@/hooks/useOutageDetail';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { relativeTime, formatNumber } from '@/lib/format';
import { toast } from 'sonner';

export function OutageDetailSheet() {
  const { t } = useTranslation();
  const id = useAppStore((s) => s.selectedOutageId);
  const close = () => useAppStore.getState().selectOutage(null);
  const { data, isLoading } = useOutageDetail(id);
  const qc = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: () => api.post(`/api/outages/${encodeURIComponent(id!)}/confirm`),
    onSuccess: () => {
      toast.success(t('outage.confirm_done'));
      qc.invalidateQueries({ queryKey: ['outage', id] });
      qc.invalidateQueries({ queryKey: ['outages'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.post(`/api/outages/${encodeURIComponent(id!)}/resolve`),
    onSuccess: () => {
      toast.success(t('outage.resolve_done'));
      qc.invalidateQueries({ queryKey: ['outage', id] });
      qc.invalidateQueries({ queryKey: ['outages'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const isCeb = data?.source === 'ceb';
  const isResolved = data?.resolvedAt != null || data?.status === 'resolved';
  const startedAt = data?.firstSeenAt ?? data?.reportedAt ?? data?.timestamp ?? null;
  const affected = data?.numCustomers ?? data?.populationAffected ?? data?.confirmedBy ?? null;

  return (
    <Sheet open={id !== null} onOpenChange={(o) => (o ? null : close())}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full ${
                isResolved ? 'bg-green-500' : 'bg-red-500 animate-pulse'
              }`}
            />
            <Badge variant={isCeb ? 'destructive' : 'secondary'} className="text-[10px]">
              {isCeb ? t('outage.ceb_official') : t('outage.crowdsourced')}
            </Badge>
            {data?.type && (
              <Badge variant="outline" className="text-[10px]">
                {t(`outage.${data.type}`, { defaultValue: data.type })}
              </Badge>
            )}
          </div>
          <SheetTitle className="text-left text-base font-bold">
            {isLoading ? <Skeleton className="h-5 w-40" /> : data?.areaName ?? data?.nearestPlace ?? '—'}
          </SheetTitle>
          {data?.description && (
            <SheetDescription className="text-left">{data.description}</SheetDescription>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="grid grid-cols-3 gap-2 px-4 py-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-2 px-4 py-4">
              <Stat
                icon={<Clock className="h-4 w-4" />}
                label={t('outage.started_ago', { time: relativeTime(startedAt) })}
                value={relativeTime(startedAt) || '—'}
              />
              <Stat
                icon={<Users className="h-4 w-4" />}
                label={isCeb ? t('outage.homes_affected_other', { count: affected ?? 0 }) : t('outage.people_affected_other', { count: affected ?? 0 })}
                value={formatNumber(affected)}
              />
              <Stat
                icon={<MapPin className="h-4 w-4" />}
                label={data.areaName ?? data.nearestPlace ?? ''}
                value={data.areaName ?? data.nearestPlace ?? '—'}
              />
            </div>

            {!isResolved && (
              <div className="flex gap-2 px-4 pb-6">
                <Button
                  className="flex-1"
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('outage.confirm_button')}
                </Button>
                {!isCeb && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => resolveMutation.mutate()}
                    disabled={resolveMutation.isPending}
                  >
                    {t('outage.resolve_button')}
                  </Button>
                )}
              </div>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border bg-muted/30 flex flex-col justify-between border p-2">
      <div className="text-muted-foreground flex items-center gap-1 text-[10px] uppercase">
        {icon}
      </div>
      <div className="text-base font-bold">{value}</div>
      <div className="text-muted-foreground line-clamp-1 text-[10px]">{label}</div>
    </div>
  );
}
