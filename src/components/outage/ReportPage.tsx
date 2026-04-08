import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, ZapOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/stores/appStore';
import { useHomeLocation } from '@/hooks/useHomeLocation';
import { useGeolocation } from '@/hooks/useGeolocation';
import { submitReportResilient } from '@/lib/offlineQueue';
import { ApiError } from '@/lib/api';
import type { ReportCreateResponse } from '@/types/api';
import { toast } from 'sonner';
import { LocationChooser, type ChosenLocation } from './LocationChooser';

/**
 * Full-screen report overlay — replaces the old Vaul Drawer.
 *
 * Why a page, not a drawer:
 *   - Drawer swipe-to-dismiss fought MapLibre pan gestures inside
 *     the map picker on real iOS devices.
 *   - A drawer only has ~80 vh of usable space, which was cramped
 *     once we added location chooser + description + summary.
 *   - A full-screen overlay gives the form full vertical room and a
 *     dedicated "Close" button, same pattern native apps use.
 *
 * Default location priority: manual (header selection) → home
 * (profile) → browser GPS → empty.
 */
export function ReportPage() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.reportPageOpen);
  const close = useAppStore((s) => s.closeReportSheet);
  const manual = useAppStore((s) => s.manualLocation);
  const { home } = useHomeLocation();
  const { position } = useGeolocation(false);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<ChosenLocation | null>(null);
  const qc = useQueryClient();

  // Compute the "best default" once per open so the user isn't
  // surprised by a location jumping under them after initial load.
  const defaultLocation: ChosenLocation | null = useMemo(() => {
    if (manual) {
      return {
        lat: manual.lat,
        lon: manual.lon,
        source: 'search',
        name: manual.name,
        displayName: manual.displayName,
      };
    }
    if (home) {
      return {
        lat: home.lat,
        lon: home.lon,
        source: 'home',
        name: home.name,
        displayName: home.displayName,
      };
    }
    if (position) {
      return {
        lat: position.lat,
        lon: position.lon,
        source: 'gps',
        name: null,
        displayName: null,
      };
    }
    return null;
  }, [manual, home, position]);

  useEffect(() => {
    if (!open) {
      setDescription('');
      setLocation(null);
      return;
    }
    // Only set the default on the OPEN transition so we don't clobber
    // the user's selection while they're interacting with the page.
    setLocation(defaultLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = useMutation<ReportCreateResponse | null, Error>({
    mutationFn: () =>
      submitReportResilient({
        lat: location!.lat,
        lon: location!.lon,
        type: 'unplanned',
        description: description.trim() || undefined,
      }),
    onSuccess: (data) => {
      if (data === null) {
        toast.success(t('report.success_title'), { description: t('report.success_body') });
      } else if (data.fused) {
        toast.success(t('report.fused_title'), { description: t('report.fused_body') });
      } else {
        toast.success(t('report.success_title'), { description: t('report.success_body') });
      }
      qc.invalidateQueries({ queryKey: ['outages'] });
      qc.invalidateQueries({ queryKey: ['power-status'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      qc.invalidateQueries({ queryKey: ['me', 'reports'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      close();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const detail = err.detail as { message?: string } | undefined;
        toast.error(t('report.duplicate_title'), {
          description: detail?.message ?? t('report.duplicate_body'),
        });
      } else {
        toast.error(t('report.error_submit'));
      }
    },
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="report-page"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-background fixed inset-0 z-[60] flex flex-col"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <header className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center">
                <ZapOff className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold">{t('report.title')}</h1>
                <p className="text-muted-foreground truncate text-[10px]">
                  {t('report.subtitle')}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={close}
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide">
                {t('report.location_label')}
              </label>
              <div className="mt-1.5">
                <LocationChooser value={location} onChange={setLocation} />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide">
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
              <p className="text-muted-foreground mt-1 text-[10px]">
                {description.length}/500
              </p>
            </div>

            <div className="border-border bg-muted/30 flex items-start gap-2 border p-3">
              <AlertCircle className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {t('report.expiry_hint')}
              </p>
            </div>
          </div>

          <footer className="border-border shrink-0 border-t p-3">
            <Button
              size="lg"
              className="h-11 w-full text-sm font-bold"
              disabled={!location || submit.isPending}
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
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
