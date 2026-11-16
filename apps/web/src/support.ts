// Small helpers for the two "keep the site running" extras: the donation link and
// page analytics. Both are pure so they can be tested.

/**
 * The donation page from `VITE_DONATE_URL`, or undefined when it is unset or not a
 * plain https link (so a typo in the env var can never produce a `javascript:` href).
 */
export const parseDonateUrl = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
};

/**
 * What analytics may know about the page being viewed: its path, nothing more.
 * - Private room IDs are the invite secret, so every game page is `/g/[room]`.
 * - Query strings and fragments are dropped: the password-reset link carries its
 *   one-time token there.
 */
export const redactUrl = (href: string): string => {
  try {
    const url = new URL(href);
    return url.pathname.startsWith('/g/') ? `${url.origin}/g/[room]` : `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
};
