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
});

export type Env = z.infer<typeof EnvSchema>;

export const loadEnv = (source: Record<string, string | undefined> = process.env): Env => {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === 'production' && source.ALLOWED_ORIGINS === undefined) {
    throw new Error('ALLOWED_ORIGINS must be set explicitly in production.');
  }
  return parsed.data;
};
