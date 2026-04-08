import { OutageMap } from '@/components/map/OutageMap';

/**
 * Fills the entire main scroll area. AppShell uses flex-col with the
 * main region as flex-1 min-h-0, so `h-full w-full` gives MapLibre the
 * complete remaining space between the header and the bottom nav —
 * regardless of how tall the two-line header ends up.
 */
export function MapPage() {
  return (
    <div className="h-full w-full">
      <OutageMap />
    </div>
  );
}
