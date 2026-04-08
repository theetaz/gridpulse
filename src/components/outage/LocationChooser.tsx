import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Locate, Search, MapPin, Loader2, X, Home, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGeocodeSearch } from '@/hooks/useGeocodeSearch';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useHomeLocation } from '@/hooks/useHomeLocation';
import { formatNumber } from '@/lib/format';
import { MapPickerDialog } from './MapPickerDialog';

export interface ChosenLocation {
  lat: number;
  lon: number;
  source: 'gps' | 'home' | 'search' | 'map';
  name: string | null;
  displayName: string | null;
}

interface Props {
  value: ChosenLocation | null;
  onChange: (loc: ChosenLocation) => void;
  /** Hide the home option (useful when choosing the home location itself). */
  hideHome?: boolean;
}

type Mode = 'quick' | 'search' | 'map';

/**
 * Three-mode location picker used by the report sheet and the profile
 * home-location setter:
 *
 *   1. quick   — one-tap buttons: "Use my current location" + "Use home"
 *   2. search  — typeahead via GeoPop /cities/search
 *   3. map     — draggable crosshair with live reverse geocode
 */
export function LocationChooser({ value, onChange, hideHome }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('quick');
  const [query, setQuery] = useState('');
  const [mapOpen, setMapOpen] = useState(false);

  const { home } = useHomeLocation();
  const { position, loading: gpsLoading, error: gpsError, refresh } = useGeolocation(false);
  const { data: searchData, isFetching: searching } = useGeocodeSearch(query);

  const searchResults = searchData?.results ?? [];

  const pickCurrent = () => {
    refresh();
    if (position) {
      onChange({
        lat: position.lat,
        lon: position.lon,
        source: 'gps',
        name: null,
        displayName: null,
      });
    }
  };

  const pickHome = () => {
    if (!home) return;
    onChange({
      lat: home.lat,
      lon: home.lon,
      source: 'home',
      name: home.name,
      displayName: home.displayName,
    });
  };

  // Best initial center for the map picker: current value → home → GPS → Colombo
  const mapInitial = useMemo(() => {
    if (value) return { lat: value.lat, lon: value.lon };
    if (home) return { lat: home.lat, lon: home.lon };
    if (position) return { lat: position.lat, lon: position.lon };
    return { lat: 6.9271, lon: 79.8612 }; // Colombo fallback
  }, [value, home, position]);

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="border-border grid grid-cols-3 gap-0 border">
        <ModeTab
          active={mode === 'quick'}
          onClick={() => setMode('quick')}
          icon={<Locate className="h-3.5 w-3.5" />}
          label={t('report.mode_quick')}
        />
        <ModeTab
          active={mode === 'search'}
          onClick={() => setMode('search')}
          icon={<Search className="h-3.5 w-3.5" />}
          label={t('report.mode_search')}
        />
        <ModeTab
          active={mode === 'map'}
          onClick={() => setMode('map')}
          icon={<MapPin className="h-3.5 w-3.5" />}
          label={t('report.mode_map')}
        />
      </div>

      {/* Mode panel */}
      {mode === 'quick' && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start gap-3 py-3"
            onClick={pickCurrent}
            disabled={gpsLoading}
          >
            <Locate className="h-4 w-4 shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-xs font-bold uppercase tracking-wide">
                {t('report.use_my_location')}
              </p>
              {gpsLoading ? (
                <p className="text-muted-foreground text-[11px]">{t('home.locating')}</p>
              ) : gpsError ? (
                <p className="text-muted-foreground text-[11px]">{t('home.location_error')}</p>
              ) : position ? (
                <p className="text-muted-foreground font-mono text-[11px]">
                  {position.lat.toFixed(5)}, {position.lon.toFixed(5)}
                </p>
              ) : (
                <p className="text-muted-foreground text-[11px]">{t('report.gps_tap_to_use')}</p>
              )}
            </div>
          </Button>

          {!hideHome && home && (
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-start gap-3 py-3"
              onClick={pickHome}
            >
              <Home className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1 text-left">
                <p className="text-xs font-bold uppercase tracking-wide">
                  {t('report.use_home')}
                </p>
                <p className="text-muted-foreground truncate text-[11px]">{home.name}</p>
              </div>
            </Button>
          )}
        </div>
      )}

      {mode === 'search' && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={t('search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="border-border max-h-60 overflow-y-auto border">
            {searching && (
              <p className="text-muted-foreground flex items-center gap-2 p-3 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('common.loading')}
              </p>
            )}
            {!searching && query.length >= 2 && searchResults.length === 0 && (
              <p className="text-muted-foreground p-3 text-xs">{t('search.no_results')}</p>
            )}
            {searchResults.map((r) => (
              <button
                key={r.placeId}
                type="button"
                style={{ touchAction: 'manipulation' }}
                // Use onPointerDown so the selection happens BEFORE the
                // soft keyboard starts animating away — otherwise on iOS
                // the button moves under the user's finger between
                // pointerdown and the synthetic click, and the click
                // lands on empty space.
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (document.activeElement as HTMLElement | null)?.blur();
                  onChange({
                    lat: r.lat,
                    lon: r.lon,
                    source: 'search',
                    name: r.name,
                    displayName: r.displayName,
                  });
                  setQuery('');
                }}
                className="border-border hover:bg-accent flex w-full items-center gap-3 border-b p-3 text-left last:border-0 active:bg-accent"
              >
                <MapPin className="text-muted-foreground h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-muted-foreground truncate text-[11px]">{r.displayName}</p>
                </div>
                {r.population > 0 && (
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {formatNumber(r.population)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
       * Map mode doesn't render the map inline — it opens a full-screen
       * MapPickerDialog so MapLibre's pan gesture doesn't fight Vaul's
       * swipe-to-dismiss on the parent Drawer.
       */}
      {mode === 'map' && (
        <Button
          type="button"
          variant="outline"
          className="h-auto w-full justify-start gap-3 py-3"
          onClick={() => setMapOpen(true)}
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <div className="flex-1 text-left">
            <p className="text-xs font-bold uppercase tracking-wide">
              {value?.source === 'map' ? t('report.pick_again_on_map') : t('report.pick_on_map')}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {t('report.pick_on_map_hint')}
            </p>
          </div>
          <Pencil className="text-muted-foreground h-3.5 w-3.5" />
        </Button>
      )}

      <MapPickerDialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        initial={mapInitial}
        onConfirm={(p) =>
          onChange({
            lat: p.lat,
            lon: p.lon,
            source: 'map',
            name: p.name,
            displayName: p.displayName,
          })
        }
      />

      {/* Summary of current selection — always visible when a value is set */}
      {value && (
        <div className="border-border bg-muted/30 flex items-center gap-3 border p-2.5">
          <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center">
            {value.source === 'gps' && <Locate className="h-4 w-4" />}
            {value.source === 'home' && <Home className="h-4 w-4" />}
            {value.source === 'search' && <Search className="h-4 w-4" />}
            {value.source === 'map' && <MapPin className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
              {t('report.selected_location')} · {t(`report.src_${value.source}`)}
            </p>
            <p className="truncate text-sm font-medium">
              {value.name ?? value.displayName ?? t('report.pin_only')}
            </p>
            <p className="text-muted-foreground font-mono text-[10px]">
              {value.lat.toFixed(5)}, {value.lon.toFixed(5)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 border-r px-2 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors last:border-r-0 ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
