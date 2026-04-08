import { OutageMap } from '@/components/map/OutageMap';

export function MapPage() {
  return (
    <div className="h-[calc(100svh-3.5rem-5rem)] w-full">
      <OutageMap />
    </div>
  );
}
