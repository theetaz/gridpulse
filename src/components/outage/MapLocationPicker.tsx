import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Loader2 } from 'lucide-react';
import { useGeocodeReverse } from '@/hooks/useGeocodeReverse';
import { useTheme } from '@/components/theme-provider';
import { useTranslation } from 'react-i18next';

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export interface PickedPoint {
  lat: number;
  lon: number;
  name: string | null;
  displayName: string | null;
}

interface Props {
  initial: { lat: number; lon: number };
  onChange: (point: PickedPoint) => void;
}

/**
 * Mini MapLibre map with a crosshair fixed to the viewport center.
 * As the user pans, we reverse-geocode the center and push the
 * result up through onChange. No marker — the whole map is the
 * "cursor" and the fixed crosshair shows where the pin will drop.
 */
export function MapLocationPicker({ initial, onChange }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [center, setCenter] = useState(initial);
  const { theme } = useTheme();

  const { data: reverse, isFetching } = useGeocodeReverse(center.lat, center.lon);

  // Propagate the picked point (coords + place name) up to the parent
  // whenever center or reverse-geocode updates.
  useEffect(() => {
    onChange({
      lat: center.lat,
      lon: center.lon,
      name: reverse?.place?.name ?? null,
      displayName: reverse?.place?.displayName ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lon, reverse?.place?.name]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? STYLE_DARK : STYLE_LIGHT,
      center: [initial.lon, initial.lat],
      zoom: 14,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const updateCenter = () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lon: c.lng });
    };
    map.on('moveend', updateCenter);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="border-border relative h-64 overflow-hidden border">
        <div ref={containerRef} className="h-full w-full" />
        {/* Fixed crosshair overlay — stays at the map center */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="bg-primary/90 text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full shadow-lg ring-4 ring-white/40">
            <Crosshair className="h-4 w-4" strokeWidth={3} />
          </div>
        </div>
      </div>

      <div className="border-border bg-muted/30 border p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
          {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          <span>{t('report.picked_location')}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium">
          {reverse?.place?.name ?? t('report.dragging_map')}
        </p>
        <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
          {center.lat.toFixed(5)}, {center.lon.toFixed(5)}
        </p>
      </div>
    </div>
  );
}
