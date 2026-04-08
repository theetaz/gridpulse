import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Search, Locate, X } from 'lucide-react';
import { useGeocodeSearch } from '@/hooks/useGeocodeSearch';
import { useAppStore } from '@/stores/appStore';
import { formatNumber } from '@/lib/format';

export function LocationSearch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data, isFetching } = useGeocodeSearch(query);

  const manual = useAppStore((s) => s.manualLocation);
  const setManual = useAppStore((s) => s.setManualLocation);

  const results = data?.results ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <MapPin className="h-3.5 w-3.5" />
          <span className="max-w-24 truncate">{manual ? manual.name : t('search.auto')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('search.title')}</DialogTitle>
          <DialogDescription>{t('search.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            autoFocus
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="max-h-72 overflow-y-auto">
          {manual && (
            <button
              type="button"
              onClick={() => {
                setManual(null);
                setOpen(false);
              }}
              className="border-border hover:bg-accent flex w-full items-center gap-3 border-b p-3 text-left"
            >
              <Locate className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t('search.use_gps')}</p>
                <p className="text-muted-foreground text-[11px]">{t('search.use_gps_subtitle')}</p>
              </div>
              <X className="text-muted-foreground h-3.5 w-3.5" />
            </button>
          )}

          {isFetching && <p className="text-muted-foreground p-3 text-xs">{t('common.loading')}</p>}

          {!isFetching && query.length >= 2 && results.length === 0 && (
            <p className="text-muted-foreground p-3 text-xs">{t('search.no_results')}</p>
          )}

          {results.map((r) => (
            <button
              key={r.placeId}
              type="button"
              onClick={() => {
                setManual({
                  lat: r.lat,
                  lon: r.lon,
                  name: r.name,
                  displayName: r.displayName,
                });
                setOpen(false);
                setQuery('');
              }}
              className="border-border hover:bg-accent flex w-full items-center gap-3 border-b p-3 text-left last:border-0"
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
      </DialogContent>
    </Dialog>
  );
}
