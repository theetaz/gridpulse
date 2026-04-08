import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { LocationSearch } from '@/components/common/LocationSearch';
import { ProfileMenu } from '@/components/common/ProfileMenu';

export function Header() {
  const { t } = useTranslation();
  return (
    <header
      className="border-border bg-background/80 shrink-0 border-b backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center">
            <Zap className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold tracking-tight">{t('app.name')}</h1>
            <p className="text-muted-foreground text-[10px]">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
      <div className="border-border flex items-center justify-between gap-2 overflow-x-auto border-t px-3 py-1.5">
        <LocationSearch />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
