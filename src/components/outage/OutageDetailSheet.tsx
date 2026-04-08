import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock,
  Users,
  MapPin,
  CheckCircle2,
  Zap,
  Trash2,
  EyeIcon,
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useOutageDetail } from '@/hooks/useOutageDetail';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getDeviceId } from '@/lib/api';
import { relativeTime, absoluteTime, formatNumber } from '@/lib/format';
import { usePresenceStore } from '@/stores/presenceStore';
import { toast } from 'sonner';

/**
 * Sleek single-column detail sheet. Prior version used a 3-column
 * stat grid that ballooned when any value (address, time) was long,
 * causing the sheet to overflow on real phones.
 *
 * Layout (top to bottom):
 *   1. Status dot + source badge + type chip + close
 *   2. Big area title (single line, truncate)
 *   3. Row — started (relative + absolute, timezone-aware)
 *   4. Row — affected / reporter name
 *   5. Row — full address (single line, truncate)
 *   6. Optional description
 *   7. CTA buttons (Confirm + Power's back, owner-only)
 *   8. Presence strip — "N people viewing now"
 */
export function OutageDetailSheet() {
  const { t } = useTranslation();
  const id = useAppStore((s) => s.selectedOutageId);
  const close = () => useAppStore.getState().selectOutage(null);
  const { data, isLoading } = useOutageDetail(id);
  const presence = usePresenceStore((s) => s.onlineCount);
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
      qc.invalidateQueries({ queryKey: ['me', 'reports'] });
      close();
    },
    onError: () => toast.error(t('common.error')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/outages/${encodeURIComponent(id!)}`),
    onSuccess: () => {
      toast.success(t('me.deleted_ok'));
      qc.invalidateQueries({ queryKey: ['outage', id] });
      qc.invalidateQueries({ queryKey: ['outages'] });
      qc.invalidateQueries({ queryKey: ['me', 'reports'] });
      close();
    },
    onError: () => toast.error(t('common.error')),
  });

  const isCeb = data?.source === 'ceb';
  const isResolved = data?.resolvedAt != null || data?.status === 'resolved';
  const startedAt = data?.firstSeenAt ?? data?.reportedAt ?? data?.timestamp ?? null;
  const affectedCount =
    data?.numCustomers ?? data?.populationAffected ?? data?.confirmedBy ?? null;
  const address = data?.areaName ?? data?.nearestPlace ?? '—';
  const me = getDeviceId();
  const isOwner = !isCeb && data?.userId === me;
  const reporterLabel = (() => {
    if (!data || isCeb) return null;
    if (data.isAnonymous) return t('outage.reported_by_anonymous');
    if (data.reporterName) return t('outage.reported_by', { name: data.reporterName });
    return null;
  })();

  return (
    <Sheet open={id !== null} onOpenChange={(o) => (o ? null : close())}>
      <SheetContent side="bottom" className="rounded-t-xl p-0">
        {/* 1. Top strip */}
        <SheetHeader className="space-y-2 p-4 pb-2">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                isResolved ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
              }`}
            />
            <Badge
              variant={isCeb ? 'destructive' : 'secondary'}
              className="h-5 px-1.5 text-[9px] uppercase tracking-wide"
            >
              {isCeb ? t('outage.ceb_official') : t('outage.crowdsourced')}
            </Badge>
            {data?.type && (
              <Badge variant="outline" className="h-5 px-1.5 text-[9px] uppercase">
                {t(`outage.${data.type}`, { defaultValue: data.type })}
              </Badge>
            )}
          </div>

          {/* 2. Title */}
          {isLoading ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <SheetTitle className="truncate text-left text-lg font-bold">
              {data?.areaName ?? data?.nearestPlace ?? '—'}
            </SheetTitle>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-2 px-4 pb-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ) : data ? (
          <>
            {/* 3,4,5. Three info rows */}
            <div className="divide-border divide-y">
              <InfoRow
                icon={<Clock className="h-3.5 w-3.5" />}
                top={relativeTime(startedAt) || '—'}
                bottom={absoluteTime(startedAt)}
              />
              <InfoRow
                icon={<Users className="h-3.5 w-3.5" />}
                top={
                  affectedCount != null
                    ? `${formatNumber(affectedCount)} ${
                        isCeb ? t('outage.homes') : t('outage.confirms')
                      }`
                    : '—'
                }
                bottom={reporterLabel ?? undefined}
              />
              <InfoRow
                icon={<MapPin className="h-3.5 w-3.5" />}
                top={address}
                bottom={undefined}
                truncate
              />
            </div>

            {/* Optional description */}
            {data.description && (
              <div className="border-border border-t px-4 py-2.5">
                <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
                  {t('outage.note')}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed">{data.description}</p>
              </div>
            )}

            {/* CTA buttons */}
            {!isResolved && (
              <div className="border-border space-y-2 border-t p-4 pb-3">
                <Button
                  className="h-10 w-full text-sm font-bold"
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {t('outage.confirm_button')}
                </Button>
                {isOwner && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="h-9 flex-1 text-xs"
                      onClick={() => resolveMutation.mutate()}
                      disabled={resolveMutation.isPending}
                    >
                      <Zap className="mr-1 h-3.5 w-3.5" />
                      {t('outage.resolve_button')}
                    </Button>
                    <Button
                      variant="outline"
                      className="text-muted-foreground hover:text-red-600 h-9 flex-1 text-xs"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t('me.delete')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Presence strip */}
            <div className="border-border text-muted-foreground flex items-center justify-between border-t px-4 py-2 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="flex h-1.5 w-1.5 items-center justify-center">
                  <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                <EyeIcon className="h-3 w-3" />
                {presence > 0
                  ? t('outage.viewing_now', { count: presence })
                  : t('outage.you_only')}
              </span>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({
  icon,
  top,
  bottom,
  truncate,
}: {
  icon: React.ReactNode;
  top: string;
  bottom?: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-medium ${truncate ? 'truncate' : ''}`}>{top}</p>
        {bottom && (
          <p className="text-muted-foreground mt-0.5 truncate text-[10px]">{bottom}</p>
        )}
      </div>
    </div>
  );
}
