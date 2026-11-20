import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { type Announcement, ANNOUNCEMENT_MAX_LENGTH } from '@bugshop/protocol';
import { serverNow } from './serverClock.ts';

// The banner message comes from a small JSON file written by the private admin
// dashboard (separate repo, never public). This server mounts the file's volume
// read-only and only ever reads it, so there is no admin API on the public server.
//
// The file is still treated as untrusted input: size-capped, strictly validated,
// and anything wrong means "no banner". Its contents are never logged.

/** Largest file we read. A valid announcement is far smaller. */
const MAX_FILE_BYTES = 4 * 1024;
/** Look at the file's modification time at most this often. */
const CHECK_EVERY_MS = 10_000;

/** Control characters (newlines included) and bidi overrides, which could make the text read differently. */
const UNSAFE_CHARS = /[\p{Cc}‪-‮⁦-⁩]/u;

const AnnouncementFileSchema = z.strictObject({
  message: z
    .string()
    .trim()
    .min(1)
    .max(ANNOUNCEMENT_MAX_LENGTH)
    .refine(s => !UNSAFE_CHARS.test(s)),
  level: z.enum(['info', 'warning']),
  /** When it was set (ms since epoch). Clients use it to remember dismissals per message. */
  updatedAt: z.number().int().nonnegative(),
  /** Optional: stop showing it after this time (ms since epoch). */
  expiresAt: z.number().int().nonnegative().optional(),
});

/** Parse the file's text into an announcement, or null if it isn't a valid, current one. */
export const parseAnnouncementFile = (text: string, now: number): Announcement | null => {
  if (text.length > MAX_FILE_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = AnnouncementFileSchema.safeParse(data);
  if (!parsed.success) return null;
  const { message, level, updatedAt, expiresAt } = parsed.data;
  if (expiresAt !== undefined && expiresAt <= now) return null;
  return { message, level, updatedAt };
};

export interface AnnouncementSource {
  /** The current announcement, or null for no banner. */
  current(): Promise<Announcement | null>;
}

/** Reads the announcement file at `path` (or nothing, when no path is configured). */
export const createAnnouncementSource = (path: string | undefined, now: () => number = serverNow): AnnouncementSource => {
  let checkedAt = -Infinity;
  let mtimeMs: number | undefined;
  let text: string | undefined;

  const refresh = async () => {
    if (!path) return;
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) {
        mtimeMs = undefined;
        text = undefined;
        return;
      }
      if (info.mtimeMs === mtimeMs) return;
      text = await readFile(path, 'utf8');
      mtimeMs = info.mtimeMs;
    } catch {
      // No file (no announcement set) or unreadable: no banner.
      mtimeMs = undefined;
      text = undefined;
    }
  };

  return {
    async current() {
      if (!path) return null;
      const t = now();
      if (t - checkedAt >= CHECK_EVERY_MS) {
        checkedAt = t;
        await refresh();
      }
      // Re-parsed on every call so an expiry takes effect on time.
      return text === undefined ? null : parseAnnouncementFile(text, t);
    },
  };
};
