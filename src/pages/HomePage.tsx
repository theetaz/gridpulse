import { StatusCard } from '@/components/home/StatusCard';
import { NearbyOutages } from '@/components/home/NearbyOutages';
import { useLocation } from '@/hooks/useLocation';

export function HomePage() {
  const { lat, lon } = useLocation();
  return (
    <div className="space-y-3 p-3">
      <StatusCard />
      <NearbyOutages lat={lat} lon={lon} />
    </div>
  );
}
