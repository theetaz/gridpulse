import { StatusCard } from '@/components/home/StatusCard';
import { NearbyOutages } from '@/components/home/NearbyOutages';
import { ActiveReportsBanner } from '@/components/home/ActiveReportsBanner';
import { useLocation } from '@/hooks/useLocation';

export function HomePage() {
  const { lat, lon } = useLocation();
  return (
    <div className="space-y-3 p-3">
      <ActiveReportsBanner />
      <StatusCard />
      <NearbyOutages lat={lat} lon={lon} />
    </div>
  );
}
