import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useOutages } from '@/hooks/useOutages';
import { useLocation } from '@/hooks/useLocation';
import { useAppStore } from '@/stores/appStore';
import { useTheme } from '@/components/theme-provider';
import { buildOutageGeoJSON } from '@/lib/geo-helpers';
import { MapControls } from './MapControls';

// When the user pans the map more than ~5 km from the last fetched
// point, trigger a fresh /api/outages/near call for the new region.
const REFETCH_DISTANCE_KM = 5;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const SRI_LANKA_CENTER: [number, number] = [80.7, 7.8];
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function OutageMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Location used as the default fetch center. When the user pans the
  // map, we override this with the map center so the lazy endpoint
  // refreshes for wherever they're actually looking.
  const location = useLocation();
  const [fetchCenter, setFetchCenter] = useState<{ lat: number; lon: number } | null>(null);

  const effectiveCenter = fetchCenter ?? (
    location.lat != null && location.lon != null ? { lat: location.lat, lon: location.lon } : null
  );

  const { data } = useOutages({
    lat: effectiveCenter?.lat,
    lon: effectiveCenter?.lon,
    radiusKm: 40,
    limit: 6,
  });

  const { theme } = useTheme();
  const selectOutage = useAppStore((s) => s.selectOutage);
  const showCeb = useAppStore((s) => s.showCeb);
  const showCrowd = useAppStore((s) => s.showCrowd);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? STYLE_DARK : STYLE_LIGHT,
      center: SRI_LANKA_CENTER,
      zoom: 7,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    );

    map.on('load', () => {
      map.addSource('ceb-polygons', { type: 'geojson', data: EMPTY_FC });
      map.addSource('ceb-points', { type: 'geojson', data: EMPTY_FC });
      map.addSource('crowd-points', { type: 'geojson', data: EMPTY_FC });

      // Polygon fills (CEB multi-point outages)
      map.addLayer({
        id: 'ceb-polygons-fill',
        type: 'fill',
        source: 'ceb-polygons',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.25,
        },
      });
      map.addLayer({
        id: 'ceb-polygons-line',
        type: 'line',
        source: 'ceb-polygons',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
        },
      });

      // Single-point CEB outages
      map.addLayer({
        id: 'ceb-points-circle',
        type: 'circle',
        source: 'ceb-points',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      // Crowdsourced reports
      map.addLayer({
        id: 'crowd-points-circle',
        type: 'circle',
        source: 'crowd-points',
        paint: {
          'circle-radius': 7,
          'circle-color': '#3b82f6',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      // Click → open detail sheet
      const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) selectOutage(id);
      };
      const onEnter = () => (map.getCanvas().style.cursor = 'pointer');
      const onLeave = () => (map.getCanvas().style.cursor = '');
      ['ceb-polygons-fill', 'ceb-points-circle', 'crowd-points-circle'].forEach((layerId) => {
        map.on('click', layerId, onClick);
        map.on('mouseenter', layerId, onEnter);
        map.on('mouseleave', layerId, onLeave);
      });

      // Debounced "pan → refetch" trigger. On moveend we compare the new
      // center to the last fetched point, and only kick a new query if
      // the user has moved far enough to matter.
      let debounceHandle: number | undefined;
      map.on('moveend', () => {
        if (debounceHandle != null) window.clearTimeout(debounceHandle);
        debounceHandle = window.setTimeout(() => {
          const c = map.getCenter();
          setFetchCenter((prev) => {
            if (!prev) return { lat: c.lat, lon: c.lng };
            const moved = haversineKm(prev.lat, prev.lon, c.lat, c.lng);
            return moved >= REFETCH_DISTANCE_KM ? { lat: c.lat, lon: c.lng } : prev;
          });
        }, 500);
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push outage data into the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const apply = () => {
      const { polygons, cebPoints, crowdPoints } = buildOutageGeoJSON(data.ceb, data.crowdsourced);
      (map.getSource('ceb-polygons') as GeoJSONSource | undefined)?.setData(polygons);
      (map.getSource('ceb-points') as GeoJSONSource | undefined)?.setData(cebPoints);
      (map.getSource('crowd-points') as GeoJSONSource | undefined)?.setData(crowdPoints);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [data]);

  // User location marker — position is either the browser's GPS or the
  // user's manually chosen city.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || location.lat == null || location.lon == null) return;
    const coords: [number, number] = [location.lon, location.lat];
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat(coords);
    } else {
      const el = document.createElement('div');
      el.className = 'h-3 w-3 rounded-full bg-blue-500 ring-4 ring-blue-500/30';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(map);
    }
    map.flyTo({ center: coords, zoom: 12, duration: 1500 });
  }, [location.lat, location.lon]);

  // Toggle CEB/crowd layer visibility without rebuilding the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const cebVis = showCeb ? 'visible' : 'none';
      const crowdVis = showCrowd ? 'visible' : 'none';
      if (map.getLayer('ceb-polygons-fill')) map.setLayoutProperty('ceb-polygons-fill', 'visibility', cebVis);
      if (map.getLayer('ceb-polygons-line')) map.setLayoutProperty('ceb-polygons-line', 'visibility', cebVis);
      if (map.getLayer('ceb-points-circle')) map.setLayoutProperty('ceb-points-circle', 'visibility', cebVis);
      if (map.getLayer('crowd-points-circle')) map.setLayoutProperty('crowd-points-circle', 'visibility', crowdVis);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [showCeb, showCrowd]);

  // Theme change → swap basemap style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    map.setStyle(isDark ? STYLE_DARK : STYLE_LIGHT);
    // Re-add sources/layers after style swap
    map.once('styledata', () => {
      if (!map.getSource('ceb-polygons')) {
        map.addSource('ceb-polygons', { type: 'geojson', data: EMPTY_FC });
        map.addSource('ceb-points', { type: 'geojson', data: EMPTY_FC });
        map.addSource('crowd-points', { type: 'geojson', data: EMPTY_FC });
        map.addLayer({
          id: 'ceb-polygons-fill',
          type: 'fill',
          source: 'ceb-polygons',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 },
        });
        map.addLayer({
          id: 'ceb-polygons-line',
          type: 'line',
          source: 'ceb-polygons',
          paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
        });
        map.addLayer({
          id: 'ceb-points-circle',
          type: 'circle',
          source: 'ceb-points',
          paint: {
            'circle-radius': 8,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
        map.addLayer({
          id: 'crowd-points-circle',
          type: 'circle',
          source: 'crowd-points',
          paint: {
            'circle-radius': 7,
            'circle-color': '#3b82f6',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      }
      if (data) {
        const { polygons, cebPoints, crowdPoints } = buildOutageGeoJSON(data.ceb, data.crowdsourced);
        (map.getSource('ceb-polygons') as GeoJSONSource | undefined)?.setData(polygons);
        (map.getSource('ceb-points') as GeoJSONSource | undefined)?.setData(cebPoints);
        (map.getSource('crowd-points') as GeoJSONSource | undefined)?.setData(crowdPoints);
      }
    });
  }, [theme, data]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <MapControls />
    </div>
  );
}
