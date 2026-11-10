import { useSyncExternalStore, type MouseEvent } from 'react';

/** Minimal client-side router on the History API (no dependency needed for 3 routes). */

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
window.addEventListener('popstate', notify);

export const navigate = (path: string, opts: { replace?: boolean } = {}) => {
  if (opts.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  notify();
};

export const usePath = (): string =>
  useSyncExternalStore(
    l => (listeners.add(l), () => listeners.delete(l)),
    () => location.pathname,
  );

/** Click handler for internal links: navigate without a page load. */
export const linkTo = (path: string) => (e: MouseEvent) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(path);
};

export type Route = { page: 'home' } | { page: 'hotseat' } | { page: 'game'; roomId: string } | { page: 'not-found' };

/** Room IDs come from the URL, so they are untrusted: accept only the server's ID alphabet. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{4,32}$/;

export const parseRoute = (path: string): Route => {
  if (path === '/' || path === '') return { page: 'home' };
  if (path === '/hotseat') return { page: 'hotseat' };
  const m = /^\/g\/([^/]+)$/.exec(path);
  if (m && ROOM_ID_PATTERN.test(m[1]!)) return { page: 'game', roomId: m[1]! };
  return { page: 'not-found' };
};
