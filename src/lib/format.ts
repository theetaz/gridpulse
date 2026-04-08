/**
 * Plain-language formatters used everywhere in the UI.
 * Keep these dumb — no i18n inside, the caller handles strings.
 */

import { formatDistanceToNow } from 'date-fns';

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    const date = typeof value === 'string' ? parseLocalDateTime(value) : value;
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '';
  }
}

/**
 * D1 emits SQLite-style timestamps "2026-04-08 12:48:14" (no T, no Z) which
 * Date() interprets as local. We need to treat them as UTC since that's what
 * `datetime('now')` returns.
 */
function parseLocalDateTime(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }
  return new Date(value);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)} km`;
}

export function formatDuration(mins: number | null | undefined): string {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = mins / 60;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

/**
 * Absolute date/time formatted in the viewer's local timezone.
 * Returns something like "Apr 8, 9:11 PM GMT+5:30" regardless of
 * where the report was originally submitted — the user sees it as
 * their local clock would read it.
 */
export function absoluteTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    const date = typeof value === 'string' ? parseAny(value) : value;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'shortOffset',
    }).format(date);
  } catch {
    return '';
  }
}

function parseAny(value: string): Date {
  // D1 datetime('now') returns "YYYY-MM-DD HH:MM:SS" (UTC).
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }
  return new Date(value);
}
