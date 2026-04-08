/**
 * Pre-rendered SVG markers for the map. Returning a DOM element
 * (not a React render) keeps MapLibre's Marker class happy and
 * avoids the overhead of mounting a React root per pin — with up to
 * a few hundred points on screen, the difference matters.
 *
 * Variants:
 *   - ceb:   red round pin with a lightning bolt (CEB-confirmed)
 *   - crowd: blue round pin with a "users" glyph (neighbor reported)
 *   - mine:  purple pin with a pulsing ring (your own report)
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
 * Build a DOM element for a single marker. The returned element is
 * handed directly to `new maplibregl.Marker({ element })`.
 */
export function buildMarkerElement(kind: MarkerKind): HTMLDivElement {
  const style = STYLES[kind];
  const wrap = document.createElement('div');
  wrap.className = 'gp-marker';
  wrap.style.cssText = `
    width: ${style.size}px;
    height: ${style.size}px;
    border-radius: 9999px;
    background: ${style.bg};
    box-shadow: 0 0 0 3px ${style.ring}, 0 2px 6px rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transform: translateZ(0);
    transition: transform 120ms ease, box-shadow 120ms ease;
    border: 2px solid rgba(255,255,255,0.9);
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
    wrap.appendChild(halo);
    wrap.style.position = 'relative';
  }

  const iconSize = style.size * 0.55;
  wrap.innerHTML += `
    <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}"
         viewBox="0 0 24 24" fill="none" stroke="${style.iconColor}"
         stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
         style="position: relative; z-index: 1;">
      <path d="${style.path}" />
    </svg>`;

  wrap.addEventListener('mouseenter', () => {
    wrap.style.transform = 'scale(1.12)';
  });
  wrap.addEventListener('mouseleave', () => {
    wrap.style.transform = 'scale(1)';
  });

  return wrap;
}

/**
 * One-time stylesheet injection for the pulse animation. Safe to call
 * multiple times — subsequent calls are no-ops.
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
  `;
  document.head.appendChild(style);
}
