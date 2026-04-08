/**
 * Thin client for our self-hosted GeoPop API.
 * Used to enrich crowdsourced outage reports with:
 *   - nearest named place  (/reverse)
 *   - affected population  (/exposure)
 *
 * All methods are resilient — if GeoPop is unreachable or returns
 * an error, we return null instead of throwing. Reports should still
 * be saveable even if enrichment fails.
 */

interface ReverseResponse {
  success: boolean;
  payload?: {
    place_id: number;
    name: string;
    display_name: string;
    address?: {
      state?: string;
      district?: string;
      country?: string;
      village?: string;
    };
  };
}

interface ExposureResponse {
  success: boolean;
  payload?: {
    coordinate: { lat: number; lon: number };
    radius_km: number;
    total_population: number;
    area_km2: number;
    density_per_km2: number;
    place_count: number;
  };
}

interface CitySearchResponse {
  success: boolean;
  payload?: {
    query: string;
    country: string | null;
    count: number;
    results: Array<{
      place_id: number;
      name: string;
      display_name: string;
      country_code: string;
      country: string;
      admin1: string | null;
      admin2: string | null;
      feature_code: string;
      lat: number;
      lon: number;
      population: number;
      score: number;
    }>;
  };
}

export interface ReverseGeocodeResult {
  placeName: string; // Short name, e.g. "Maradana"
  displayName: string; // Full, e.g. "Maradana, Colombo District, …"
  district: string | null;
  province: string | null;
}

export interface ExposureResult {
  totalPopulation: number;
  densityPerKm2: number;
  placeCount: number;
  radiusKm: number;
}

export interface CitySearchResult {
  placeId: number;
  name: string;
  displayName: string;
  admin1: string | null;
  lat: number;
  lon: number;
  population: number;
}

export class GeoPopService {
  constructor(private readonly baseUrl: string) {}

  async reverse(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/reverse?lat=${lat}&lon=${lon}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as ReverseResponse;
      if (!data.success || !data.payload) return null;
      return {
        placeName: data.payload.name,
        displayName: data.payload.display_name,
        district: data.payload.address?.district ?? null,
        province: data.payload.address?.state ?? null,
      };
    } catch (err) {
      console.warn('[geopop] reverse failed', err);
      return null;
    }
  }

  async searchCities(query: string, limit = 8): Promise<CitySearchResult[]> {
    try {
      const url = `${this.baseUrl}/api/v1/cities/search?q=${encodeURIComponent(query)}&country=LK&limit=${limit}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = (await res.json()) as CitySearchResponse;
      if (!data.success || !data.payload) return [];
      return data.payload.results.map((r) => ({
        placeId: r.place_id,
        name: r.name,
        displayName: r.display_name,
        admin1: r.admin1,
        lat: r.lat,
        lon: r.lon,
        population: r.population,
      }));
    } catch (err) {
      console.warn('[geopop] cities/search failed', err);
      return [];
    }
  }

  async exposure(lat: number, lon: number, radiusKm = 2): Promise<ExposureResult | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/exposure?lat=${lat}&lon=${lon}&radius=${radiusKm}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as ExposureResponse;
      if (!data.success || !data.payload) return null;
      return {
        totalPopulation: Math.round(data.payload.total_population),
        densityPerKm2: Math.round(data.payload.density_per_km2),
        placeCount: data.payload.place_count,
        radiusKm: data.payload.radius_km,
      };
    } catch (err) {
      console.warn('[geopop] exposure failed', err);
      return null;
    }
  }
}
