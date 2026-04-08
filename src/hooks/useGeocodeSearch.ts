import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CityResult {
  placeId: number;
  name: string;
  displayName: string;
  admin1: string | null;
  lat: number;
  lon: number;
  population: number;
}

/**
 * Debounced city search against /api/geocode/search. Returns an empty
 * list until the user has typed at least 2 characters.
 */
export function useGeocodeSearch(query: string) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  return useQuery({
    queryKey: ['geocode', debounced],
    queryFn: () => api.get<{ results: CityResult[] }>(`/api/geocode/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
}
