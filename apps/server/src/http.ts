import { createEndpoint, createRouter } from '@colyseus/core';
import { type AccountInfo, type AuthProviders, type Leaderboard, type ProfileError, ApiPath, LEADERBOARD } from '@bugshop/protocol';
import type { Auth } from './auth.ts';
import type { PlayerRow, PlayerStore } from './db.ts';
import { RateLimiter } from './rateLimit.ts';
import { ProfileSchema } from './schemas.ts';
import { serverNow } from './serverClock.ts';

export interface Accounts {
  auth: Auth;
  players: PlayerStore;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const record = ({ userId: _, ...rest }: PlayerRow) => rest;

/** Names nobody may take: they would read as the site or as a seat label. */
const RESERVED = new Set(['admin', 'administrator', 'bugshop', 'moderator', 'mod', 'support', 'system', 'you', 'opponent', 'white', 'black']);

/**
 * HTTP routes next to Colyseus' matchmaking: Better Auth under /api/auth, plus the
 * few account endpoints the web app needs. CORS headers are added by Colyseus
 * (allowlisted origins only, see app.ts).
 */
export const createAccountRoutes = (accounts: Accounts, originOk: (origin: string | null) => boolean) => {
  const { auth, players } = accounts;
  const profileLimiter = new RateLimiter(20, 60_000);

  return createRouter({
    // Better Auth reads the raw request itself, so the body must stay unread here.
    auth: createEndpoint(
      `${ApiPath.auth}/**`,
      { method: ['GET', 'POST'], disableBody: true, requireRequest: true },
      async ctx => auth.handler(ctx.request),
    ),

    providers: createEndpoint(ApiPath.providers, { method: 'GET' }, async () => json(auth.providers satisfies AuthProviders)),

    // Public: names and ratings only (no emails or account IDs). Read-only, so it
    // needs neither a session nor an origin check; the store caches it, so it's cheap.
    leaderboard: createEndpoint(ApiPath.leaderboard, { method: 'GET' }, async () =>
      json({ players: players.leaderboard(LEADERBOARD.size, LEADERBOARD.minGames) } satisfies Leaderboard),
    ),

    me: createEndpoint(ApiPath.me, { method: 'GET', requireHeaders: true }, async ctx => {
      const user = await auth.userFor(ctx.headers);
      if (!user) return json({ error: 'signed-out' }, 401);
      const player = players.get(user.id);
      return json({ email: user.email, player: player ? record(player) : null } satisfies AccountInfo);
    }),

    profile: createEndpoint(
      ApiPath.profile,
      { method: 'POST', disableBody: true, requireRequest: true },
      async ctx => {
        const { request } = ctx;
        // Cookies ride along on cross-site requests; only our own pages may change an account.
        if (!originOk(request.headers.get('origin'))) return json({ error: 'forbidden' }, 403);
        const user = await auth.userFor(request.headers);
        if (!user) return json({ error: 'signed-out' }, 401);
        if (!profileLimiter.take(user.id)) return json({ error: 'slow-down' }, 429);

        const fail = (error: ProfileError, status: number) => json({ error }, status);
        const raw = await request.text().catch(() => '');
        if (raw.length > 512) return fail('invalid', 400);
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return fail('invalid', 400);
        }
        const parsed = ProfileSchema.safeParse(body);
        if (!parsed.success || RESERVED.has(parsed.data.handle.toLowerCase())) return fail('invalid', 400);

        const res = players.create(user.id, parsed.data.handle, serverNow());
        if (!res.ok) return fail(res.error, 409);
        return json({ email: user.email, player: record(res.player) } satisfies AccountInfo);
      },
    ),
  });
};
