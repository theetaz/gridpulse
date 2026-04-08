import { useEffect, useState } from 'react';
import {
  getHomeLocation,
  setHomeLocation as writeHomeLocation,
  clearHomeLocation as wipeHomeLocation,
  type HomeLocation,
} from '@/lib/profile';

/**
 * Reactive wrapper around the persisted home location. Components
 * subscribe via the `profile-change` + `storage` events so a save
 * in one tab / component updates every consumer immediately.
 */
export function useHomeLocation() {
  const [home, setHome] = useState<HomeLocation | null>(() => getHomeLocation());

  useEffect(() => {
    const handler = () => setHome(getHomeLocation());
    window.addEventListener('profile-change', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('profile-change', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return {
    home,
    setHome: (loc: HomeLocation) => {
      writeHomeLocation(loc);
      setHome(loc);
    },
    clear: () => {
      wipeHomeLocation();
      setHome(null);
    },
  };
}
