import { useGeolocation, type GeoErrorReason } from './useGeolocation';
import { useAppStore } from '@/stores/appStore';

/**
 * The single source of truth for "where is the user?" across the app.
 *
 * - If the user picked a city from the search, use that.
 * - Otherwise fall back to the browser's GPS position.
 *
 * Components should import this, not useGeolocation directly, so
 * switching between manual and auto works everywhere at once.
 */
export function useLocation() {
  const geo = useGeolocation();
  const manual = useAppStore((s) => s.manualLocation);

  if (manual) {
    return {
      lat: manual.lat,
      lon: manual.lon,
      placeName: manual.name,
      displayName: manual.displayName,
      source: 'manual' as const,
      error: null,
      errorReason: null as GeoErrorReason | null,
      loading: false,
      refresh: geo.refresh,
    };
  }

  return {
    lat: geo.position?.lat ?? null,
    lon: geo.position?.lon ?? null,
    placeName: null,
    displayName: null,
    source: 'gps' as const,
    error: geo.error,
    errorReason: geo.errorReason,
    loading: geo.loading,
    refresh: geo.refresh,
  };
}
