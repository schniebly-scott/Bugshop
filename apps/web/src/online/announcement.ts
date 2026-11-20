import { type Announcement, ANNOUNCEMENT_MAX_LENGTH, ApiPath } from '@bugshop/protocol';
import { SERVER_URL } from './session';

/** Control characters and bidi overrides: never shown, even if the server let them through. */
const UNSAFE_CHARS = /[\p{Cc}‪-‮⁦-⁩]/u;

/** The reply is untrusted: read each field and check it, or show no banner. */
export const parseAnnouncement = (data: unknown): Announcement | null => {
  const a = (data as { announcement?: unknown } | null)?.announcement as Partial<Announcement> | null | undefined;
  if (!a || typeof a !== 'object') return null;
  const { message, level, updatedAt } = a;
  if (typeof message !== 'string' || message.length === 0 || message.length > ANNOUNCEMENT_MAX_LENGTH) return null;
  if (UNSAFE_CHARS.test(message)) return null;
  if (level !== 'info' && level !== 'warning') return null;
  if (typeof updatedAt !== 'number' || !Number.isInteger(updatedAt) || updatedAt < 0) return null;
  return { message, level, updatedAt };
};

/** The current banner, `null` for none. A network error also means none: the banner is never essential. */
export const fetchAnnouncement = async (): Promise<Announcement | null> => {
  try {
    const res = await fetch(`${SERVER_URL}${ApiPath.announcement}`, { credentials: 'omit' });
    return res.ok ? parseAnnouncement(await res.json()) : null;
  } catch {
    return null;
  }
};

// Which message this browser dismissed (by its `updatedAt`): a per-browser convenience only.
const DISMISSED_KEY = 'bugshop:dismissed-announcement';

export const loadDismissed = (): number | null => {
  try {
    const n = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};

export const saveDismissed = (updatedAt: number): void => {
  try {
    localStorage.setItem(DISMISSED_KEY, String(updatedAt));
  } catch {
    /* storage unavailable: the banner comes back on the next visit */
  }
};
