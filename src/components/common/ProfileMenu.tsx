import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shuffle, Home, X } from 'lucide-react';
import { useDisplayName } from '@/hooks/useDisplayName';
import { useHomeLocation } from '@/hooks/useHomeLocation';
import { getDeviceId } from '@/lib/profile';
import { LocationChooser, type ChosenLocation } from '@/components/outage/LocationChooser';

/**
 * Pick a consistent color for the avatar background based on the device
 * id. Keeps the same colour across reloads (until the user rerolls their
 * name, in which case that stays the same since it's keyed on device id).
 */
function avatarColor(seed: string): string {
  const palette = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-lime-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-fuchsia-500',
    'bg-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

type View = 'profile' | 'home';

export function ProfileMenu() {
  const { t } = useTranslation();
  const { name, reroll, set } = useDisplayName();
  const { home, setHome, clear } = useHomeLocation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('profile');
  const [draft, setDraft] = useState(name);
  const [pickedHome, setPickedHome] = useState<ChosenLocation | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(name);
      setView('profile');
      setPickedHome(
        home
          ? {
              lat: home.lat,
              lon: home.lon,
              source: 'home',
              name: home.name,
              displayName: home.displayName,
            }
          : null,
      );
    }
  }, [open, name, home]);

  const initial = (name.match(/\b(\w)/g)?.slice(0, 2).join('') ?? 'U').toUpperCase();
  const bg = avatarColor(getDeviceId());

  return (
    <>
      <button
        type="button"
        className={`flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold text-white ${bg}`}
        onClick={() => setOpen(true)}
        aria-label={`${t('profile.title')}: ${name}`}
      >
        {initial}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {view === 'profile' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('profile.title')}</DialogTitle>
                <DialogDescription>{t('profile.subtitle')}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide">
                    {t('profile.your_name')}
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={32}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setDraft(reroll())}
                      aria-label={t('profile.reroll')}
                    >
                      <Shuffle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Home location summary */}
                <div className="border-border border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
                        {t('profile.home_location')}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-medium">
                        {home?.name ?? t('profile.home_not_set')}
                      </p>
                      {home && (
                        <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                          {home.lat.toFixed(4)}, {home.lon.toFixed(4)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setView('home')}
                      >
                        <Home className="mr-1 h-3.5 w-3.5" />
                        {home ? t('profile.change') : t('profile.set')}
                      </Button>
                      {home && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={clear}
                          aria-label={t('profile.home_clear')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-border bg-muted/30 border p-3">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
                    {t('profile.device_id')}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px]">{getDeviceId()}</p>
                  <p className="text-muted-foreground mt-2 text-[11px]">
                    {t('profile.device_note')}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    {t('common.close')}
                  </Button>
                  <Button
                    onClick={() => {
                      set(draft);
                      setOpen(false);
                    }}
                  >
                    {t('profile.save')}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t('profile.home_title')}</DialogTitle>
                <DialogDescription>{t('profile.home_subtitle')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <LocationChooser value={pickedHome} onChange={setPickedHome} hideHome />

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setView('profile')}>
                    {t('common.close')}
                  </Button>
                  <Button
                    disabled={!pickedHome}
                    onClick={() => {
                      if (!pickedHome) return;
                      setHome({
                        lat: pickedHome.lat,
                        lon: pickedHome.lon,
                        name: pickedHome.name ?? 'Home',
                        displayName: pickedHome.displayName ?? `${pickedHome.lat.toFixed(4)}, ${pickedHome.lon.toFixed(4)}`,
                      });
                      setView('profile');
                    }}
                  >
                    {t('profile.save_home')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
