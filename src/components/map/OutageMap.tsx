import { useEffect, useMemo, useState } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from 'react-i18next';
import {
  Map as MapCnMap,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MapControls as MapCnControls,
  MapClusterLayer,
  useMap,
} from '@/components/ui/map';
import { useOutages } from '@/hooks/useOutages';
import { useLocation } from '@/hooks/useLocation';
import { useAppStore } from '@/stores/appStore';
import { getDeviceId } from '@/lib/profile';
import { buildOutageGeoJSON } from '@/lib/geo-helpers';
import { LayerToggles } from './LayerToggles';
import { PresencePill } from './PresencePill';
import { CrowdMarkerIcon, MineMarkerIcon, HomeMarkerIcon } from './markers';

const SRI_LANKA_CENTER: [number, number] = [80.7, 7.8];
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

/**
 * MapCN-based outage map. All marker lifecycle is handled declaratively
 * by MapCN's <MapMarker> component — we just render children per outage
 * and MapCN diffs + positions them. No more hand-rolled marker bugs.
 *
 * The only thing we still touch via useMap() imperatively is:
 *   - The GeoJSON source for CEB multi-point cluster polygons
 *   - moveend listener for the pan-to-refetch flow
 *   - flyTo when the user changes location
 *   - triggerRepaint when the detail sheet closes
 */
export function OutageMap() {
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

  const selectOutage = useAppStore((s) => s.selectOutage);
  const selectedOutageId = useAppStore((s) => s.selectedOutageId);
  const showCeb = useAppStore((s) => s.showCeb);
  const showCrowd = useAppStore((s) => s.showCrowd);
  const showMine = useAppStore((s) => s.showMine);

  const deviceId = useMemo(() => getDeviceId(), []);

  // Split crowd reports up front so we can render them in separate
  // filtered groups (mine vs others).
  const { cebSinglePointsGeoJSON, othersCrowd, myCrowd } = useMemo(() => {
    const ceb = (data?.ceb ?? []).filter((o) => o.polygon && o.polygon.length === 1);
    const crowd = data?.crowdsourced ?? [];
    const mine = crowd.filter((r) => r.userId === deviceId);
    const others = crowd.filter((r) => r.userId !== deviceId);

    // GeoJSON FeatureCollection of CEB single-point outages for the
    // cluster layer. The properties carry just the id so the click
    // handler can open the detail sheet.
    const cebGeo: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: ceb.map((o) => ({
        type: 'Feature',
        properties: { id: o.id },
        geometry: {
          type: 'Point' as const,
          coordinates: [o.polygon[0].lon, o.polygon[0].lat],
        },
      })),
    };

    return { cebSinglePointsGeoJSON: cebGeo, othersCrowd: others, myCrowd: mine };
  }, [data, deviceId]);

  return (
    <div className="relative h-full w-full">
      <MapCnMap
        center={SRI_LANKA_CENTER}
        zoom={7}
        styles={{
          light: 'https://tiles.openfreemap.org/styles/positron',
          dark: 'https://tiles.openfreemap.org/styles/dark',
        }}
        className="h-full w-full"
      >
        <MapCnControls position="top-right" />

        {/* Imperative side-effects (polygon layer, pan refetch,
            flyTo, repaint) live in child components so they can use
            the useMap() hook. */}
        <CebPolygonLayer
          polygons={showCeb ? buildOutageGeoJSON(data?.ceb ?? [], []).polygons : emptyFc}
        />
        <ViewportTracker
          onMove={(c) => {
            setFetchCenter((prev) => {
              if (!prev) return c;
              const moved = haversineKm(prev.lat, prev.lon, c.lat, c.lon);
              return moved >= REFETCH_DISTANCE_KM ? c : prev;
            });
          }}
        />
        {location.lat != null && location.lon != null && (
          <AutoFlyTo lat={location.lat} lon={location.lon} />
        )}
        <RepaintOnCloseSheet selectedId={selectedOutageId} />

        {/* Home marker — user's selected / GPS location */}
        {location.lat != null && location.lon != null && (
          <MapMarker longitude={location.lon} latitude={location.lat}>
            <MarkerContent>
              <HomeMarkerIcon />
            </MarkerContent>
            <MarkerPopup>
              <HomePopupContent
                source={location.source}
                name={location.placeName ?? location.displayName}
                lat={location.lat}
                lon={location.lon}
              />
            </MarkerPopup>
          </MapMarker>
        )}

        {/* CEB single-point outages — clustered when zoomed out so
            dense areas don't become a wall of overlapping pins.
            Zooming in or tapping a cluster expands to individual
            points. */}
        {showCeb && (
          <MapClusterLayer
            data={cebSinglePointsGeoJSON}
            clusterMaxZoom={13}
            clusterRadius={45}
            clusterColors={['#fecaca', '#ef4444', '#991b1b']}
            clusterThresholds={[5, 20]}
            pointColor="#ef4444"
            pointRadius={11}
            onPointClick={(feature) => {
              const id = feature.properties?.id as string | undefined;
              if (id) selectOutage(id);
            }}
          />
        )}

        {/* Crowd reports from other users */}
        {showCrowd &&
          othersCrowd.map((r) => (
            <MapMarker
              key={r.id}
              longitude={r.lon}
              latitude={r.lat}
              onClick={() => selectOutage(r.id)}
            >
              <MarkerContent>
                <CrowdMarkerIcon />
              </MarkerContent>
            </MapMarker>
          ))}

        {/* Your own reports */}
        {showMine &&
          myCrowd.map((r) => (
            <MapMarker
              key={r.id}
              longitude={r.lon}
              latitude={r.lat}
              onClick={() => selectOutage(r.id)}
            >
              <MarkerContent>
                <MineMarkerIcon />
              </MarkerContent>
            </MapMarker>
          ))}
      </MapCnMap>

      <LayerToggles />
      <PresencePill />
    </div>
  );
}

const emptyFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Maintains the CEB multi-point polygon source + two layers (fill
 * + outline) on the map. Uses useMap() from MapCN for imperative
 * access to the MapLibre instance.
 */
function CebPolygonLayer({ polygons }: { polygons: GeoJSON.FeatureCollection }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!isLoaded || !map) return;
    if (!map.getSource('ceb-polygons')) {
      map.addSource('ceb-polygons', { type: 'geojson', data: emptyFc });
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
      const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) useAppStore.getState().selectOutage(id);
      };
      map.on('click', 'ceb-polygons-fill', onClick);
      map.on('mouseenter', 'ceb-polygons-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'ceb-polygons-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    }
    const source = map.getSource('ceb-polygons') as GeoJSONSource | undefined;
    source?.setData(polygons);
  }, [map, isLoaded, polygons]);

  return null;
}

/**
 * Debounced pan → refetch trigger. Fires onMove with the new center
 * 500ms after the user stops panning, so we can refetch outages for
 * the new region without hammering the worker during the drag.
 */
function ViewportTracker({ onMove }: { onMove: (c: { lat: number; lon: number }) => void }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!isLoaded || !map) return;
    let t: number | undefined;
    const handler = () => {
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        const c = map.getCenter();
        onMove({ lat: c.lat, lon: c.lng });
      }, 500);
    };
    map.on('moveend', handler);
    return () => {
      if (t != null) window.clearTimeout(t);
      map.off('moveend', handler);
    };
  }, [map, isLoaded, onMove]);
  return null;
}

/**
 * Smoothly fly to a new location whenever the user changes their
 * header city pick or GPS position.
 */
function AutoFlyTo({ lat, lon }: { lat: number; lon: number }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!isLoaded || !map) return;
    map.flyTo({ center: [lon, lat], zoom: 12, duration: 1500 });
  }, [map, isLoaded, lat, lon]);
  return null;
}

/**
 * Forces a repaint + resize after the detail sheet closes so any
 * layout reflow from Radix's body scroll-lock flip gets flushed
 * through to MapLibre's marker transforms.
 */
function RepaintOnCloseSheet({ selectedId }: { selectedId: string | null }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!isLoaded || !map) return;
    if (selectedId === null) {
      const t = window.setTimeout(() => {
        map.resize();
        map.triggerRepaint();
      }, 60);
      return () => window.clearTimeout(t);
    }
  }, [map, isLoaded, selectedId]);
  return null;
}

function HomePopupContent({
  source,
  name,
  lat,
  lon,
}: {
  source: 'gps' | 'manual';
  name: string | null;
  lat: number;
  lon: number;
}) {
  const { t } = useTranslation();
  const label = source === 'manual' ? t('map.home_manual') : t('map.home_gps');
  // MarkerPopup already wraps us in `bg-popover text-popover-foreground
  // border p-3 shadow-md`, so this component renders BARE content —
  // no outer border, no background, no padding.
  return (
    <div className="min-w-[170px]">
      <p className="text-muted-foreground text-[9px] font-bold uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-0.5 text-[12px] font-bold">{name ?? '—'}</p>
      <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">
        {lat.toFixed(5)}, {lon.toFixed(5)}
      </p>
    </div>
  );
}
