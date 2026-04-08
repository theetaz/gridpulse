import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useOutages } from '@/hooks/useOutages';
import { useLocation } from '@/hooks/useLocation';
import { useAppStore } from '@/stores/appStore';
import { useTheme } from '@/components/theme-provider';
import { buildOutageGeoJSON } from '@/lib/geo-helpers';
import { MapControls } from './MapControls';
import { getDeviceId } from '@/lib/profile';
import {
  buildMarkerElement,
  ensureMarkerStyles,
  type MarkerKind,
} from './markerIcons';

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

  // Track custom HTML markers by outage id so we can diff on updates
  // rather than tearing down and rebuilding every frame.
  const markerIndex = useRef<
    Map<string, { marker: maplibregl.Marker; kind: MarkerKind }>
  >(new Map());

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
    ensureMarkerStyles();

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
      // CEB polygons (big cluster outages) stay as a data-driven layer
      map.addSource('ceb-polygons', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'ceb-polygons-fill',
        type: 'fill',
        source: 'ceb-polygons',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.22,
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

      // Click → open detail sheet (polygons only — points are HTML markers)
      const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) selectOutage(id);
      };
      const onEnter = () => (map.getCanvas().style.cursor = 'pointer');
      const onLeave = () => (map.getCanvas().style.cursor = '');
      map.on('click', 'ceb-polygons-fill', onClick);
      map.on('mouseenter', 'ceb-polygons-fill', onEnter);
      map.on('mouseleave', 'ceb-polygons-fill', onLeave);

      // Debounced pan → refetch
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
      for (const { marker } of markerIndex.current.values()) marker.remove();
      markerIndex.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push data into the map: polygons as a GeoJSON source, points as HTML markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const apply = () => {
      const { polygons } = buildOutageGeoJSON(data.ceb, data.crowdsourced);
      (map.getSource('ceb-polygons') as GeoJSONSource | undefined)?.setData(polygons);

      // Reconcile HTML markers
      const me = getDeviceId();
      const next = new Map<
        string,
        { lat: number; lon: number; kind: MarkerKind; id: string }
      >();

      // CEB single-points (anything whose polygon has 1 vertex)
      if (showCeb) {
        for (const o of data.ceb) {
          if (!o.polygon || o.polygon.length !== 1) continue;
          next.set(o.id, {
            id: o.id,
            lat: o.polygon[0].lat,
            lon: o.polygon[0].lon,
            kind: 'ceb',
          });
        }
      }

      // Crowd reports — mine gets a distinct marker variant
      if (showCrowd) {
        for (const r of data.crowdsourced) {
          const kind: MarkerKind = r.userId === me ? 'mine' : 'crowd';
          next.set(r.id, { id: r.id, lat: r.lat, lon: r.lon, kind });
        }
      }

      // Remove stale markers
      for (const [id, entry] of markerIndex.current) {
        const incoming = next.get(id);
        if (!incoming || incoming.kind !== entry.kind) {
          entry.marker.remove();
          markerIndex.current.delete(id);
        }
      }

      // Add new markers + reposition any existing ones
      for (const { id, lat, lon, kind } of next.values()) {
        const existing = markerIndex.current.get(id);
        if (existing) {
          existing.marker.setLngLat([lon, lat]);
          continue;
        }
        const el = buildMarkerElement(kind);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          selectOutage(id);
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .addTo(map);
        markerIndex.current.set(id, { marker, kind });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [data, selectOutage, showCeb, showCrowd]);

  // User location marker
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

  // Toggle CEB/crowd layer visibility — polygons via setLayoutProperty,
  // markers get hidden/shown via visibility CSS.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const cebVis = showCeb ? 'visible' : 'none';
      if (map.getLayer('ceb-polygons-fill'))
        map.setLayoutProperty('ceb-polygons-fill', 'visibility', cebVis);
      if (map.getLayer('ceb-polygons-line'))
        map.setLayoutProperty('ceb-polygons-line', 'visibility', cebVis);

      for (const { marker, kind } of markerIndex.current.values()) {
        const el = marker.getElement();
        if (kind === 'ceb') {
          el.style.display = showCeb ? '' : 'none';
        } else {
          el.style.display = showCrowd ? '' : 'none';
        }
      }
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
    map.once('styledata', () => {
      if (!map.getSource('ceb-polygons')) {
        map.addSource('ceb-polygons', { type: 'geojson', data: EMPTY_FC });
        map.addLayer({
          id: 'ceb-polygons-fill',
          type: 'fill',
          source: 'ceb-polygons',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
        });
        map.addLayer({
          id: 'ceb-polygons-line',
          type: 'line',
          source: 'ceb-polygons',
          paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
        });
      }
      if (data) {
        const { polygons } = buildOutageGeoJSON(data.ceb, data.crowdsourced);
        (map.getSource('ceb-polygons') as GeoJSONSource | undefined)?.setData(polygons);
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
