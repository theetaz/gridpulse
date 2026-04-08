import { Zap, Users, Star, Home } from 'lucide-react';

/**
 * Marker icon components for MapCN's <MapMarker>. These are plain
 * Tailwind-styled React components — no manual DOM construction, no
 * inline transforms, no transitions. MapCN's MapMarker takes care of
 * positioning the parent; all we do is render the visual.
 */

export function CebMarkerIcon() {
  return (
    <div className="ring-red-500/35 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-red-500 shadow-lg ring-[3px]">
      <Zap className="h-3.5 w-3.5 text-white" strokeWidth={3} />
    </div>
  );
}

export function CrowdMarkerIcon() {
  return (
    <div className="ring-blue-500/35 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow-lg ring-[3px]">
      <Users className="h-3.5 w-3.5 text-white" strokeWidth={3} />
    </div>
  );
}

export function MineMarkerIcon() {
  return (
    <div className="relative">
      <span className="bg-violet-500/50 absolute -inset-1 animate-ping rounded-full" />
      <div className="ring-violet-500/55 relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-violet-500 shadow-lg ring-[3px]">
        <Star className="h-4 w-4 text-white" strokeWidth={3} fill="currentColor" />
      </div>
    </div>
  );
}

export function HomeMarkerIcon() {
  return (
    <div className="relative">
      <span className="bg-sky-400/50 absolute -inset-1 animate-ping rounded-full" />
      <div className="ring-sky-500/40 relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-sky-500 shadow-lg ring-[3px]">
        <Home className="h-4 w-4 text-white" strokeWidth={3} />
      </div>
    </div>
  );
}
