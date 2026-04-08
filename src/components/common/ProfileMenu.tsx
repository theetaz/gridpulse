import { useState } from 'react';
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
import { User, Shuffle } from 'lucide-react';
import { useDisplayName } from '@/hooks/useDisplayName';
import { getDeviceId } from '@/lib/profile';

export function ProfileMenu() {
  const { t } = useTranslation();
  const { name, reroll, set } = useDisplayName();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);

  const openMenu = () => {
    setDraft(name);
    setOpen(true);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={openMenu}
        aria-label={t('profile.title')}
      >
        <User className="h-3.5 w-3.5" />
        <span className="max-w-24 truncate">{name}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
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

            <div className="border-border bg-muted/30 border p-3">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
                {t('profile.device_id')}
              </p>
              <p className="mt-1 font-mono text-[11px] break-all">{getDeviceId()}</p>
              <p className="text-muted-foreground mt-2 text-[11px]">{t('profile.device_note')}</p>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
