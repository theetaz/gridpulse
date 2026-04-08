import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Check } from 'lucide-react';
import { MapLocationPicker, type PickedPoint } from './MapLocationPicker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { lat: number; lon: number };
  onConfirm: (picked: PickedPoint) => void;
}

/**
 * Full-screen modal that hosts the MapLocationPicker.
 *
 * This exists to sidestep a gesture conflict: MapLibre uses touchmove
 * to pan the map, and Vaul (the Drawer we use for the report form)
 * also listens to touchmove to dismiss on swipe-down. Putting the
 * picker inside a Dialog instead of inline-in-drawer gives the map
 * its own uninterrupted touch target, with no swipe-to-dismiss.
 *
 * Confirm flow: user drags the map → live reverse-geocode updates the
 * local `picked` state → tapping "Use this location" calls onConfirm
 * and closes the dialog. The parent receives the picked point and
 * updates its own state.
 */
export function MapPickerDialog({ open, onOpenChange, initial, onConfirm }: Props) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<PickedPoint | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Make this a full-bleed sheet on mobile so the map has room to breathe. */}
      <DialogContent className="flex h-svh max-h-none w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-[min(700px,90vh)] sm:max-w-lg sm:rounded-lg">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex-1">
            <DialogTitle className="text-sm font-bold">
              {t('report.pick_on_map_title')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-[11px]">
              {t('report.pick_on_map_subtitle')}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <MapLocationPicker initial={initial} onChange={setPicked} />
        </div>

        <div className="border-border flex gap-2 border-t p-3">
          <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button
            className="flex-1"
            disabled={!picked}
            onClick={() => {
              if (picked) {
                onConfirm(picked);
                onOpenChange(false);
              }
            }}
          >
            <Check className="mr-1.5 h-4 w-4" />
            {t('report.use_this_location')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
