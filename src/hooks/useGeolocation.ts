import { useEffect, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lon: number;
  accuracy: number;
}

/**
 * A machine-readable reason the geolocation request failed. UI code
 * should branch on this instead of parsing `error` — users see very
 * different instructions for "you tapped Don't Allow" vs "you're in
 * the Instagram browser" vs "GPS hardware isn't responding".
 */
export type GeoErrorReason =
  | 'unsupported' //      navigator.geolocation missing (ancient browser)
  | 'insecure' //         page loaded over http:// — Safari/Chrome block this
  | 'in_app_browser' //   Instagram / FB / LINE webview swallowed the prompt
  | 'denied' //           user tapped "Don't Allow", or OS-level Location off
  | 'unavailable' //      GPS hardware / OS couldn't determine position
  | 'timeout'; //         prompt shown but no fix within the timeout window

export interface GeoState {
  position: GeoPosition | null;
  error: string | null;
  errorReason: GeoErrorReason | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * UA tokens from in-app browsers that are known to silently block
 * `navigator.geolocation` on iOS Safari's WKWebView. We only consult
 * this list when the system actually returns PERMISSION_DENIED — if
 * a working webview gave us a position, the UA match is ignored and
 * the flag is never surfaced.
 */
const IN_APP_UA_TOKENS = [
  'FBAN',
  'FBAV', // Facebook
  'Instagram',
  'Line/', // LINE
  'Twitter', // Twitter / X in-app
  'LinkedInApp',
  'MicroMessenger', // WeChat
  'KAKAOTALK',
  'TikTok',
  'Snapchat',
];

function isInAppBrowser(ua: string): boolean {
  return IN_APP_UA_TOKENS.some((tok) => ua.includes(tok));
}

/**
 * Hard-fail conditions evaluated once at module load. These never
 * change during a session (you can't flip HTTPS on mid-page), so we
 * compute them once and read as a constant — keeps the effect free
 * of synchronous setState calls that React 19's linter rejects.
 */
const HARD_FAIL_REASON: GeoErrorReason | null = (() => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure';
  return null;
})();

const HARD_FAIL_MESSAGE: string | null =
  HARD_FAIL_REASON === 'unsupported'
    ? 'Geolocation is not supported in this browser.'
    : HARD_FAIL_REASON === 'insecure'
      ? 'Location requires a secure (HTTPS) connection.'
      : null;

export function useGeolocation(autoRequest = true): GeoState {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [asyncError, setAsyncError] = useState<string | null>(null);
  const [asyncReason, setAsyncReason] = useState<GeoErrorReason | null>(null);
  // Initial loading state: if we're going to auto-request and the
  // hard-fail conditions aren't tripped, we're loading from the very
  // first render. This keeps us from doing `setLoading(true)` inside
  // the effect, which the React 19 lint rule forbids.
  const [loading, setLoading] = useState(autoRequest && !HARD_FAIL_REASON);
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    // Skip the async path entirely on hard-fail — the derived error
    // below already surfaces the right reason to consumers.
    if (HARD_FAIL_REASON) return;
    if (!autoRequest && counter === 0) return;

    // All setState calls below run inside the browser's async
    // callbacks, so they don't count as "synchronous within the
    // effect body" and the lint rule is happy.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setAsyncError(null);
        setAsyncReason(null);
        setLoading(false);
      },
      (err) => {
        // Map the PositionError code to a reason the UI can style
        // around. The in-app browser check only runs on PERMISSION_DENIED
        // because a working webview would have returned a position —
        // so the UA-sniff can never false-positive on a happy path.
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
        let reason: GeoErrorReason;
        if (err.code === err.PERMISSION_DENIED) {
          reason = isInAppBrowser(ua) ? 'in_app_browser' : 'denied';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reason = 'unavailable';
        } else if (err.code === err.TIMEOUT) {
          reason = 'timeout';
        } else {
          reason = 'unavailable';
        }
        setAsyncReason(reason);
        setAsyncError(err.message || 'Could not get your location.');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [autoRequest, counter]);

  // `refresh` is an event handler (user-initiated), so synchronous
  // setState here is allowed and is the right place to put the
  // "entering the loading state" reset.
  const refresh = () => {
    if (HARD_FAIL_REASON) return;
    setAsyncError(null);
    setAsyncReason(null);
    setLoading(true);
    setCounter((c) => c + 1);
  };

  return {
    position,
    error: HARD_FAIL_MESSAGE ?? asyncError,
    errorReason: HARD_FAIL_REASON ?? asyncReason,
    loading,
    refresh,
  };
}
