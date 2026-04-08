import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { LocationSearch } from '@/components/common/LocationSearch';
import { ProfileMenu } from '@/components/common/ProfileMenu';

/**
 * Two-row header:
 *
 *   Row 1: logo + app name                 [🌐] [👤] [🌙]
 *   Row 2: [📍 full-width location chip]
 *
 * The prior version crammed location into row 2 alongside language +
 * profile, which truncated the location name on real phones
 * ("Wennappuwa T…", "Bright Kingf…"). Giving the location its own row
 * means the full place name is always readable.
 */
export function Header() {
  const { t } = useTranslation();
  return (
    <header
      className="border-border bg-background/80 shrink-0 border-b backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-11 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="bg-primary text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center">
            <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[13px] font-bold tracking-tight">{t('app.name')}</h1>
            <p className="text-muted-foreground truncate text-[9px]">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <LanguageSwitcher />
          <ProfileMenu />
          <ThemeToggle />
        </div>
      </div>
      <div className="border-border border-t px-3 py-1">
        <LocationSearch />
      </div>
    </header>
  );
}
