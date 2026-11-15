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
 * Private room IDs are the invite secret, so they must not reach analytics.
 * Every game page is reported as `/g/[room]`.
 */
export const redactGameUrl = (href: string): string => {
  try {
    const url = new URL(href);
    if (!url.pathname.startsWith('/g/')) return href;
    return `${url.origin}/g/[room]`;
  } catch {
    return href;
  }
};
