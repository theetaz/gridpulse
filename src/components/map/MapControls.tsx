import { useTranslation } from 'react-i18next';
import { Radio, Users, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

export function MapControls() {
  const { t } = useTranslation();
  const showCeb = useAppStore((s) => s.showCeb);
  const showCrowd = useAppStore((s) => s.showCrowd);
  const toggleCeb = useAppStore((s) => s.toggleCeb);
  const toggleCrowd = useAppStore((s) => s.toggleCrowd);

  return (
    <div className="border-border bg-background/90 pointer-events-auto absolute left-3 top-3 z-10 border backdrop-blur">
      <ToggleRow
        active={showCeb}
        label={t('map.ceb_layer')}
        icon={<Radio className="h-3.5 w-3.5" />}
        onClick={toggleCeb}
        color="text-red-500"
      />
      <ToggleRow
        active={showCrowd}
        label={t('map.crowd_layer')}
        icon={<Users className="h-3.5 w-3.5" />}
        onClick={toggleCrowd}
        color="text-blue-500"
      />
    </div>
  );
}

function ToggleRow({
  active,
  label,
  icon,
  onClick,
  color,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent flex w-full items-center gap-2 border-b border-transparent px-3 py-2 text-xs font-medium transition last:border-0"
      aria-pressed={active}
    >
      <span className={color}>{icon}</span>
      <span className="min-w-[84px] text-left">{label}</span>
      {active ? (
        <Eye className="h-3.5 w-3.5" />
      ) : (
        <EyeOff className="text-muted-foreground h-3.5 w-3.5" />
      )}
    </button>
  );
}
