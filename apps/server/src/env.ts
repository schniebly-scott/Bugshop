import { z } from 'zod';

const origin = z.url().transform(u => new URL(u).origin);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(2567),
  HOST: z.string().default('127.0.0.1'),
  /** Comma-separated origins allowed to use the server from a browser (the web app's URL). */
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:4173')
    .transform(s => s.split(',').map(o => o.trim()).filter(Boolean))
    .pipe(z.array(origin).min(1)),
  /** Matchmaking requests (create/join) allowed per IP per minute. */
  MATCHMAKE_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  /** Max simultaneous rooms on this server. */
  MAX_ROOMS: z.coerce.number().int().min(1).default(500),

  /** SQLite file holding accounts, sessions and ratings. */
  DATABASE_PATH: z.string().min(1).default('./data/bugshop.sqlite'),
  /** Signs session cookies. Required in production: `openssl rand -base64 32`. */
  AUTH_SECRET: z.string().min(32).optional(),
  /** This server's own public URL, e.g. https://api.example.com (sign-in redirects come back here). */
  PUBLIC_URL: origin.optional(),
  /** Google sign-in (OAuth client of type "Web application"). Both or neither. */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Sign in with Apple: the Services ID and the client-secret JWT generated from your key. Both or neither. */
  APPLE_CLIENT_ID: z.string().min(1).optional(),
  APPLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Resend API key and sender (e.g. "Bugshop <camp@example.com>") for verification and password-reset mail. */
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).optional(),
  /**
   * JSON file with the site banner, written by the private admin dashboard and
   * mounted read-only here. Unset: no banner.
   */
  ANNOUNCEMENT_PATH: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const loadEnv = (raw: Record<string, string | undefined> = process.env): Env => {
  // Docker Compose passes unset optional variables as empty strings: treat those as absent.
  const source = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === 'production' && source.ALLOWED_ORIGINS === undefined) {
    throw new Error('ALLOWED_ORIGINS must be set explicitly in production.');
  }
  const env = parsed.data;
  for (const [a, b] of [
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    ['APPLE_CLIENT_ID', 'APPLE_CLIENT_SECRET'],
    ['RESEND_API_KEY', 'MAIL_FROM'],
  ] as const) {
    if ((env[a] === undefined) !== (env[b] === undefined)) throw new Error(`Set both ${a} and ${b}, or neither.`);
  }
  if (env.NODE_ENV === 'production') {
    // Without these, sessions could be forged, sign-in redirects would point at
    // localhost, or anyone could register someone else's address.
    for (const k of ['AUTH_SECRET', 'PUBLIC_URL', 'RESEND_API_KEY'] as const) {
      if (env[k] === undefined) throw new Error(`${k} must be set in production.`);
    }
  }
  return env;
};

/** Secret used outside production when AUTH_SECRET is unset. Never valid in production (see above). */
export const DEV_AUTH_SECRET = 'bugshop-development-only-secret-do-not-use';
