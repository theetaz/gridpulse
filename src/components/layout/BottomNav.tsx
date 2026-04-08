import { Home, Map as MapIcon, Plus, List, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore, type Tab } from '@/stores/appStore';

const TABS: Array<{ tab: Tab; icon: typeof Home; key: string }> = [
  { tab: 'home', icon: Home, key: 'nav.home' },
  { tab: 'map', icon: MapIcon, key: 'nav.map' },
  { tab: 'feed', icon: List, key: 'nav.feed' },
  { tab: 'stats', icon: BarChart3, key: 'nav.stats' },
];

export function BottomNav() {
  const { t } = useTranslation();
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const openReportSheet = useAppStore((s) => s.openReportSheet);

  return (
    <nav
      className="border-border bg-background/95 shrink-0 border-t backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative grid h-16 grid-cols-5">
        {TABS.slice(0, 2).map(({ tab: t2, icon: Icon, key }) => (
          <NavButton
            key={t2}
            active={tab === t2}
            label={t(key)}
            icon={<Icon className="h-5 w-5" />}
            onClick={() => setTab(t2)}
          />
        ))}

        {/* Center: Report FAB */}
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            onClick={openReportSheet}
            className="bg-primary text-primary-foreground hover:bg-primary/90 absolute -top-4 flex h-14 w-14 items-center justify-center shadow-lg transition active:scale-95"
            aria-label={t('nav.report')}
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>

        {TABS.slice(2).map(({ tab: t2, icon: Icon, key }) => (
          <NavButton
            key={t2}
            active={tab === t2}
            label={t(key)}
            icon={<Icon className="h-5 w-5" />}
            onClick={() => setTab(t2)}
          />
        ))}
      </div>
    </nav>
  );
}

function NavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
