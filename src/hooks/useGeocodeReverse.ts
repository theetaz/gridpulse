import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ReversePlace {
  name: string;
  displayName: string;
  district: string | null;
  province: string | null;
}

interface ReverseResponse {
  place: ReversePlace | null;
}

/**
 * Look up the named place at a coordinate via GeoPop (proxied through
 * the worker). Used by the map-pin-point picker to show a live place
 * label as the user drags the crosshair.
 *
 * Note: this takes rounded coordinates so rapid pan events collapse
 * to a single query when the user is hovering in one area.
 */
export function useGeocodeReverse(lat: number | null, lon: number | null) {
  const roundedLat = lat != null ? Number(lat.toFixed(4)) : null;
  const roundedLon = lon != null ? Number(lon.toFixed(4)) : null;
  return useQuery({
    queryKey: ['geocode-reverse', roundedLat, roundedLon],
    queryFn: () =>
      api.get<ReverseResponse>(`/api/geocode/reverse?lat=${roundedLat}&lon=${roundedLon}`),
    enabled: roundedLat != null && roundedLon != null,
    staleTime: 5 * 60_000,
  });
}
