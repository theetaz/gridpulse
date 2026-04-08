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
import { Loader2, ZapOff } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useHomeLocation } from '@/hooks/useHomeLocation';
import { useGeolocation } from '@/hooks/useGeolocation';
import { submitReportResilient } from '@/lib/offlineQueue';
import type { ReportCreateResponse } from '@/types/api';
import { toast } from 'sonner';
import { LocationChooser, type ChosenLocation } from './LocationChooser';

export function ReportSheet() {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.reportSheetOpen);
  const close = useAppStore((s) => s.closeReportSheet);
  const { home } = useHomeLocation();
  const { position } = useGeolocation(false);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<ChosenLocation | null>(null);
  const qc = useQueryClient();

  // When the sheet opens, initialize the picked location with the user's
  // strongest default: home → current GPS → nothing (user must pick).
  useEffect(() => {
    if (!open) {
      setDescription('');
      setLocation(null);
      return;
    }
    if (home) {
      setLocation({
        lat: home.lat,
        lon: home.lon,
        source: 'home',
        name: home.name,
        displayName: home.displayName,
      });
    } else if (position) {
      setLocation({
        lat: position.lat,
        lon: position.lon,
        source: 'gps',
        name: null,
        displayName: null,
      });
    }
  }, [open, home, position]);

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
      close();
    },
    onError: () => toast.error(t('report.error_submit')),
  });

  return (
    <Drawer open={open} onOpenChange={(o) => (o ? null : close())}>
      <DrawerContent>
        <div className="mx-auto flex max-h-[90vh] w-full max-w-md flex-col">
          <DrawerHeader className="shrink-0 text-left">
            <div className="bg-primary text-primary-foreground mb-3 flex h-10 w-10 items-center justify-center">
              <ZapOff className="h-5 w-5" />
            </div>
            <DrawerTitle className="text-xl">{t('report.title')}</DrawerTitle>
            <DrawerDescription>{t('report.subtitle')}</DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4">
            <LocationChooser value={location} onChange={setLocation} />

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

          <DrawerFooter className="shrink-0">
            <Button
              size="lg"
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
            <Button variant="ghost" onClick={close}>
              {t('common.close')}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
