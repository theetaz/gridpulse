import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Loader2, ZapOff } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useLocation } from '@/hooks/useLocation';
import { submitReportResilient } from '@/lib/offlineQueue';
import type { ReportCreateResponse } from '@/types/api';
import { toast } from 'sonner';

export function ReportSheet() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.reportSheetOpen);
  const close = useAppStore((s) => s.closeReportSheet);
  const { lat, lon, error: geoError, loading: geoLoading, refresh, source, placeName } = useLocation();
  const [description, setDescription] = useState('');
  const qc = useQueryClient();

  // Re-prompt for location whenever the sheet opens
  useEffect(() => {
    if (open) refresh();
    if (!open) setDescription('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = useMutation<ReportCreateResponse | null, Error>({
    mutationFn: () =>
      submitReportResilient({
        lat: lat!,
        lon: lon!,
        type: 'unplanned',
        description: description.trim() || undefined,
      }),
    onSuccess: (data) => {
      if (data === null) {
        // Queued offline — surfaces the same success copy so the user
        // doesn't worry; it'll sync when they're back online.
        toast.success(t('report.success_title'), { description: t('report.success_body') });
      } else if (data.fused) {
        toast.success(t('report.fused_title'), { description: t('report.fused_body') });
      } else {
        toast.success(t('report.success_title'), { description: t('report.success_body') });
      }
      qc.invalidateQueries({ queryKey: ['outages'] });
      qc.invalidateQueries({ queryKey: ['power-status'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      close();
    },
    onError: () => {
      toast.error(t('report.error_submit'));
    },
  });

  return (
    <Drawer open={open} onOpenChange={(o) => (o ? null : close())}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader className="text-left">
            <div className="bg-primary text-primary-foreground mb-3 flex h-10 w-10 items-center justify-center">
              <ZapOff className="h-5 w-5" />
            </div>
            <DrawerTitle className="text-xl">{t('report.title')}</DrawerTitle>
            <DrawerDescription>{t('report.subtitle')}</DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 px-4">
            <div className="border-border bg-muted/30 flex items-start gap-3 border p-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                {geoLoading ? (
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t('home.locating')}
                  </div>
                ) : geoError ? (
                  <div>
                    <p className="text-sm font-medium">{t('report.error_location')}</p>
                    <button
                      type="button"
                      onClick={refresh}
                      className="text-primary mt-1 text-xs hover:underline"
                    >
                      {t('home.location_retry')}
                    </button>
                  </div>
                ) : lat != null && lon != null ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide">
                      {source === 'manual' ? t('search.using_manual') : t('report.use_my_location')}
                    </p>
                    {placeName && (
                      <p className="text-xs font-medium">{placeName}</p>
                    )}
                    <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                      {lat.toFixed(5)}, {lon.toFixed(5)}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wide">
                {t('report.description_label')}
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('report.description_placeholder')}
                rows={3}
                maxLength={500}
                className="mt-1.5"
              />
            </div>
          </div>

          <DrawerFooter>
            <Button
              size="lg"
              disabled={lat == null || lon == null || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('report.submitting')}
                </>
              ) : (
                t('report.submit')
              )}
            </Button>
            <Button variant="ghost" onClick={close}>
              {t('common.close')}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
