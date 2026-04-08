import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from 'react-i18next';
import { useOutages } from '@/hooks/useOutages';
import { useLocation } from '@/hooks/useLocation';
import { useAppStore } from '@/stores/appStore';
import { useTheme } from '@/components/theme-provider';
import { buildOutageGeoJSON } from '@/lib/geo-helpers';
import { MapControls } from './MapControls';
import { PresencePill } from './PresencePill';
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
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const homeMarkerRef = useRef<maplibregl.Marker | null>(null);

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
  const selectedOutageId = useAppStore((s) => s.selectedOutageId);
  const showCeb = useAppStore((s) => s.showCeb);
  const showCrowd = useAppStore((s) => s.showCrowd);
  const showMine = useAppStore((s) => s.showMine);

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

      // Crowd reports split into "mine" and "others". Each has its own
      // independent toggle so users can see just their own reports,
      // just others', or both.
      for (const r of data.crowdsourced) {
        const isMine = r.userId === me;
        if (isMine && !showMine) continue;
        if (!isMine && !showCrowd) continue;
        next.set(r.id, {
          id: r.id,
          lat: r.lat,
          lon: r.lon,
          kind: isMine ? 'mine' : 'crowd',
        });
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
  }, [data, selectOutage, showCeb, showCrowd, showMine]);

  // User location marker — shown as a home icon, clickable to show a
  // popup with the location name / coordinates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || location.lat == null || location.lon == null) return;
    const coords: [number, number] = [location.lon, location.lat];

    if (homeMarkerRef.current) {
      homeMarkerRef.current.setLngLat(coords);
    } else {
      const el = buildMarkerElement('home');
      const marker = new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map);
      // Popup with the location name — MapLibre sync-positions it
      // with the marker automatically.
      const popup = new maplibregl.Popup({
        offset: 20,
        closeButton: false,
        className: 'gp-home-popup',
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const label =
          location.placeName ||
          location.displayName ||
          `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`;
        const sourceLabel =
          location.source === 'manual'
            ? t('map.home_manual')
            : t('map.home_gps');
        popup
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family: inherit; padding: 2px 4px;">
               <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7;">${sourceLabel}</div>
               <div style="font-size: 12px; font-weight: 700; margin-top: 2px;">${escapeHtml(label)}</div>
             </div>`,
          )
          .addTo(map);
      });
      homeMarkerRef.current = marker;
    }
    map.flyTo({ center: coords, zoom: 12, duration: 1500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.lat, location.lon, location.placeName, location.source]);

  // Only the CEB *polygons* need visibility via setLayoutProperty.
  // Individual markers are now added/removed by the data effect based
  // on the flags, so we don't need to keep hidden markers around.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const cebVis = showCeb ? 'visible' : 'none';
      if (map.getLayer('ceb-polygons-fill'))
        map.setLayoutProperty('ceb-polygons-fill', 'visibility', cebVis);
      if (map.getLayer('ceb-polygons-line'))
        map.setLayoutProperty('ceb-polygons-line', 'visibility', cebVis);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [showCeb]);

  // Fix for the "marker ghost" bug: when the Radix Dialog detail sheet
  // closes, it flips body.style.overflow off, which triggers a layout
  // recalc that leaves MapLibre's marker transforms in a stale state —
  // they look invisible until the user pans the map. Forcing a repaint
  // + resize after the sheet closes restores them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedOutageId === null) {
      const t1 = window.setTimeout(() => {
        map.resize();
        map.triggerRepaint();
      }, 60);
      return () => window.clearTimeout(t1);
    }
  }, [selectedOutageId]);

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
      <PresencePill />
    </div>
  );
}

/**
 * Conservative HTML escaping for the popup content. MapLibre's
 * setHTML takes raw HTML so we need to neutralize user-controlled
 * bits (place names could contain quotes or angle brackets).
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
