/**
 * Pre-rendered SVG markers for the map. Returning a DOM element
 * (not a React render) keeps MapLibre's Marker class happy and
 * avoids the overhead of mounting a React root per pin — with up to
 * a few hundred points on screen, the difference matters.
 *
 * IMPORTANT: the returned element is what MapLibre writes its
 * `transform: translate(x, y)` onto for positioning. We must not
 * overwrite its transform with our own hover/scale effects — doing
 * that was the cause of a bug where tapping a marker caused it to
 * jump to the map origin on mobile (mouseenter fired and clobbered
 * MapLibre's translate; mouseleave never fired on touch, leaving the
 * marker stuck off-center).
 *
 * Layout:
 *   outer        — handed to MapLibre. Plain wrapper, no transform.
 *     inner      — the visible circle. Hover scales THIS element.
 *       halo     — absolute-positioned pulsing ring (mine/home only).
 *       svg      — the icon.
 *
 * Variants:
 *   - ceb:   red round pin with a lightning bolt (CEB-confirmed)
 *   - crowd: blue round pin with a "users" glyph (neighbor reported)
 *   - mine:  purple pin with a pulsing halo (your own report)
 *   - home:  sky-blue pin with a home icon (your selected location)
 */

export type MarkerKind = 'ceb' | 'crowd' | 'mine' | 'home';

const ZAP_PATH =
  'M13 2 3 14h9l-1 8 10-12h-9l1-8Z';

const USERS_PATH =
  'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M12.5 7.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75';

const STAR_PATH =
  'M12 2 15.09 8.26 22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2Z';

const HOME_PATH =
  'M3 9 12 2l9 7v11a2 2 0 0 1-2 2h-4v-8h-6v8H5a2 2 0 0 1-2-2V9Z';

interface Style {
  bg: string;
  ring: string;
  path: string;
  iconColor: string;
  size: number;
  glow: boolean;
}

const STYLES: Record<MarkerKind, Style> = {
  ceb: {
    bg: '#ef4444',
    ring: 'rgba(239, 68, 68, 0.35)',
    path: ZAP_PATH,
    iconColor: '#ffffff',
    size: 26,
    glow: false,
  },
  crowd: {
    bg: '#3b82f6',
    ring: 'rgba(59, 130, 246, 0.35)',
    path: USERS_PATH,
    iconColor: '#ffffff',
    size: 26,
    glow: false,
  },
  mine: {
    bg: '#8b5cf6',
    ring: 'rgba(139, 92, 246, 0.55)',
    path: STAR_PATH,
    iconColor: '#ffffff',
    size: 30,
    glow: true,
  },
  home: {
    bg: '#0ea5e9',
    ring: 'rgba(14, 165, 233, 0.4)',
    path: HOME_PATH,
    iconColor: '#ffffff',
    size: 30,
    glow: true,
  },
};

/**
 * Build a DOM element for a single marker. Returns the OUTER wrapper
 * (the one you hand to `new maplibregl.Marker({ element })`); the
 * outer is transform-free, and the inner child carries the visual
 * + hover scale.
 */
export function buildMarkerElement(kind: MarkerKind): HTMLDivElement {
  const style = STYLES[kind];

  // Outer wrapper — MapLibre positions this via `transform: translate(...)`.
  // We must NEVER set a transform on it ourselves.
  const outer = document.createElement('div');
  outer.className = `gp-marker gp-marker-${kind}`;
  outer.style.cssText = `
    width: ${style.size}px;
    height: ${style.size}px;
    cursor: pointer;
    position: relative;
  `;

  // Inner — the visible circle. Hover scales this one.
  const inner = document.createElement('div');
  inner.className = 'gp-marker-inner';
  inner.style.cssText = `
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    background: ${style.bg};
    box-shadow: 0 0 0 3px ${style.ring}, 0 2px 6px rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(255,255,255,0.9);
    transform: scale(1);
    transition: transform 120ms ease;
    will-change: transform;
  `;

  if (style.glow) {
    const halo = document.createElement('span');
    halo.style.cssText = `
      position: absolute;
      inset: -6px;
      border-radius: 9999px;
      background: ${style.ring};
      animation: gpMarkerPulse 1.6s ease-out infinite;
      pointer-events: none;
    `;
    inner.appendChild(halo);
  }

  const iconSize = style.size * 0.55;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', String(iconSize));
  svg.setAttribute('height', String(iconSize));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', style.iconColor);
  svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.style.position = 'relative';
  svg.style.zIndex = '1';
  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('d', style.path);
  svg.appendChild(path);
  inner.appendChild(svg);

  outer.appendChild(inner);

  // Hover scales the INNER element only — never the outer, which
  // MapLibre owns.
  outer.addEventListener('mouseenter', () => {
    inner.style.transform = 'scale(1.12)';
  });
  outer.addEventListener('mouseleave', () => {
    inner.style.transform = 'scale(1)';
  });
  // Reset on pointer cancel / touch end in case mouseleave never fires
  // (common on iOS after a tap).
  outer.addEventListener('touchend', () => {
    inner.style.transform = 'scale(1)';
  });
  outer.addEventListener('touchcancel', () => {
    inner.style.transform = 'scale(1)';
  });

  return outer;
}

/**
 * One-time stylesheet injection for the pulse animation + theme-aware
 * popup styling. Safe to call multiple times — subsequent calls are
 * no-ops.
 */
export function ensureMarkerStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('gp-marker-styles')) return;
  const style = document.createElement('style');
  style.id = 'gp-marker-styles';
  style.textContent = `
    @keyframes gpMarkerPulse {
      0%   { transform: scale(1);   opacity: 0.8; }
      70%  { transform: scale(1.8); opacity: 0;   }
      100% { transform: scale(1.8); opacity: 0;   }
    }

    /* Theme-aware popup — inherits the app's background/foreground
       CSS variables so the default white popup becomes black in dark
       mode. */
    .maplibregl-popup-content {
      background: var(--background) !important;
      color: var(--foreground) !important;
      border: 1px solid var(--border);
      border-radius: 0 !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35) !important;
      padding: 8px 12px !important;
      font-family: inherit !important;
    }
    .maplibregl-popup-tip {
      border-top-color: var(--background) !important;
      border-bottom-color: var(--background) !important;
      border-left-color: transparent !important;
      border-right-color: transparent !important;
    }
    .maplibregl-popup-anchor-top .maplibregl-popup-tip,
    .maplibregl-popup-anchor-top-left .maplibregl-popup-tip,
    .maplibregl-popup-anchor-top-right .maplibregl-popup-tip {
      border-bottom-color: var(--background) !important;
    }
    .maplibregl-popup-anchor-bottom .maplibregl-popup-tip,
    .maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip,
    .maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip {
      border-top-color: var(--background) !important;
    }
  `;
  document.head.appendChild(style);
}
