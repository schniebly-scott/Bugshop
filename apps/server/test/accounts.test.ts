import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Room } from '@colyseus/sdk';
import {
  type AccountInfo,
  type AuthProviders,
  type Leaderboard,
  type LobbyListing,
  type Snapshot,
  type Welcome,
  ApiPath,
  DEFAULT_SETTINGS,
  LOBBY_LIST_ROOM_NAME,
  Msg,
  ROOM_NAME,
} from '@bugshop/protocol';
import { createGameServer } from '../src/app.ts';
import { loadEnv } from '../src/env.ts';
import { type TestAccount, clientFor, cookiesOf, createAccount, postJson } from './helpers.ts';

const PORT = 33000 + Math.floor(Math.random() * 2000);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const WEB = 'http://localhost:5173';
let server: ReturnType<typeof createGameServer>;
let moth: TestAccount;
let wasp: TestAccount;

beforeAll(async () => {
  server = createGameServer(
    loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGINS: WEB, MATCHMAKE_PER_MINUTE: '1000', DATABASE_PATH: ':memory:' }),
  );
  await server.listen(PORT, '127.0.0.1');
  [moth, wasp] = await Promise.all([createAccount(ENDPOINT, 'Moth'), createAccount(ENDPOINT, 'Wasp')]);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const me = async (account: TestAccount) =>
  (await (await fetch(`${ENDPOINT}${ApiPath.me}`, { headers: { Cookie: account.cookie } })).json()) as AccountInfo;

const until = async <T,>(get: () => T | undefined, what: string): Promise<T> => {
  const start = Date.now();
  for (;;) {
    const v = get();
    if (v !== undefined) return v;
    if (Date.now() - start > 3000) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 10));
  }
};

const seat = (room: Room) => {
  room.reconnection.enabled = false;
  let color: Welcome['color'] | undefined;
  let snapshot: Snapshot | undefined;
  room.onMessage(Msg.welcome, (w: Welcome) => (color = w.color));
  room.onMessage(Msg.snapshot, (s: Snapshot) => (snapshot = s));
  return {
    room,
    color: () => color!,
    waitFor: (pred: (s: Snapshot) => boolean, what: string) => until(() => (snapshot && pred(snapshot) ? snapshot : undefined), what),
    act: (action: object) => room.request(Msg.action, action),
  };
};

const opts = { mode: 'private' as const, ...DEFAULT_SETTINGS };

/** Moth and Wasp in a started private game, keyed by color. */
const startGame = async () => {
  const a = seat(await clientFor(ENDPOINT, moth).create(ROOM_NAME, opts));
  const b = seat(await clientFor(ENDPOINT, wasp).joinById(a.room.roomId));
  await a.waitFor(s => s.game !== null, 'game start');
  await b.waitFor(s => s.game !== null, 'game start');
  const white = a.color() === 'white' ? a : b;
  const black = white === a ? b : a;
  return { a, b, white, black, whiteAccount: white === a ? moth : wasp, blackAccount: white === a ? wasp : moth };
};

describe('sign-in is required to play', () => {
  it('refuses to open or join a game without a session', async () => {
    const guest = clientFor(ENDPOINT);
    await expect(guest.create(ROOM_NAME, opts)).rejects.toMatchObject({ code: 401 });
    const host = await clientFor(ENDPOINT, moth).create(ROOM_NAME, opts);
    await expect(guest.joinById(host.roomId)).rejects.toMatchObject({ code: 401 });
    await expect(new (guest.constructor as typeof import('@colyseus/sdk').Client)(ENDPOINT, { headers: { Cookie: 'better-auth.session_token=forged.value' } }).create(ROOM_NAME, opts)).rejects.toMatchObject({ code: 401 });
    await host.leave();
  });

  it('refuses an account that has not chosen a player name yet', async () => {
    const res = await postJson(`${ENDPOINT}${ApiPath.auth}/sign-up/email`, { name: 'x', email: 'nameless@test.example', password: 'correct horse battery' });
    const cookie = cookiesOf(res);
    expect(await (await fetch(`${ENDPOINT}${ApiPath.me}`, { headers: { Cookie: cookie } })).json()).toEqual({ email: 'nameless@test.example', player: null });
    await expect(clientFor(ENDPOINT, { handle: '', email: '', cookie }).create(ROOM_NAME, opts)).rejects.toMatchObject({ code: 403 });
  });

  it('still lets visitors read the lobby list, with the host shown', async () => {
    const lobby = await clientFor(ENDPOINT, moth).create(ROOM_NAME, { ...opts, mode: 'public' });
    const watcher = await clientFor(ENDPOINT).joinOrCreate(LOBBY_LIST_ROOM_NAME);
    let list: LobbyListing[] | undefined;
    watcher.onMessage(Msg.lobbies, (l: LobbyListing[]) => (list = l));
    const entry = await until(() => list?.find(l => l.roomId === lobby.roomId), 'lobby listed');
    expect(entry.host).toEqual({ name: 'Moth', rating: 1200 });
    await watcher.leave();
    await lobby.leave();
  });

  it('rejects matchmaking from a foreign website even with a valid session', async () => {
    const res = await postJson(`${ENDPOINT}/matchmake/create/${ROOM_NAME}`, opts, { Cookie: moth.cookie, Origin: 'https://evil.example' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(await res.text()).toMatch(/Forbidden origin/);
  });
});

describe('account endpoints', () => {
  it('answers 401 without a session and returns the profile with one', async () => {
    expect((await fetch(`${ENDPOINT}${ApiPath.me}`)).status).toBe(401);
    expect(await me(moth)).toEqual({ email: 'moth@test.example', player: { name: 'Moth', rating: 1200, games: 0, wins: 0, losses: 0, draws: 0 } });
  });

  it('reports which sign-in methods are configured', async () => {
    const providers = (await (await fetch(`${ENDPOINT}${ApiPath.providers}`)).json()) as AuthProviders;
    expect(providers).toEqual({ google: false, apple: false, emailVerification: false });
  });

  it('validates player names and keeps them unique', async () => {
    const res = await postJson(`${ENDPOINT}${ApiPath.auth}/sign-up/email`, { name: 'x', email: 'picky@test.example', password: 'correct horse battery' });
    const Cookie = cookiesOf(res);
    const choose = async (body: unknown, headers: Record<string, string> = { Cookie }) => {
      const r = await postJson(`${ENDPOINT}${ApiPath.profile}`, body, headers);
      return [r.status, ((await r.json()) as { error?: string }).error];
    };
    expect(await choose({ handle: 'Gnat' }, {})).toEqual([401, 'signed-out']);
    expect(await choose({ handle: 'Gnat' }, { Cookie, Origin: 'https://evil.example' })).toEqual([403, 'forbidden']);
    for (const bad of ['ab', '1bug', 'has space', 'x'.repeat(17), '<script>', 'Admin', 'white']) {
      expect(await choose({ handle: bad })).toEqual([400, 'invalid']);
    }
    expect(await choose({ handle: 'Gnat', extra: 1 })).toEqual([400, 'invalid']);
    expect(await choose({ handle: 'mOTH' })).toEqual([409, 'taken']);
    expect(await choose({ handle: 'Gnat' })).toEqual([200, undefined]);
    expect(await choose({ handle: 'Midge' })).toEqual([409, 'already-set']);
  });

  it('does not accept the wrong password', async () => {
    const bad = await postJson(`${ENDPOINT}${ApiPath.auth}/sign-in/email`, { email: moth.email, password: 'wrong password!!' });
    expect(bad.status).toBe(401);
    expect(cookiesOf(bad)).toBe('');
    const good = await postJson(`${ENDPOINT}${ApiPath.auth}/sign-in/email`, { email: moth.email, password: 'correct horse battery' });
    expect(good.status).toBe(200);
    const setCookie = good.headers.getSetCookie().join('\n');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('signs out', async () => {
    const signIn = await postJson(`${ENDPOINT}${ApiPath.auth}/sign-in/email`, { email: wasp.email, password: 'correct horse battery' });
    const Cookie = cookiesOf(signIn);
    expect((await fetch(`${ENDPOINT}${ApiPath.me}`, { headers: { Cookie } })).status).toBe(200);
    expect((await postJson(`${ENDPOINT}${ApiPath.auth}/sign-out`, {}, { Cookie, Origin: WEB })).status).toBe(200);
    expect((await fetch(`${ENDPOINT}${ApiPath.me}`, { headers: { Cookie } })).status).toBe(401);
  });
});

describe('seats and ratings', () => {
  it('shows both players by name and refuses the same account twice', async () => {
    const host = seat(await clientFor(ENDPOINT, moth).create(ROOM_NAME, opts));
    await expect(clientFor(ENDPOINT, moth).joinById(host.room.roomId)).rejects.toMatchObject({ code: 409 });
    const guest = seat(await clientFor(ENDPOINT, wasp).joinById(host.room.roomId));
    const s = await guest.waitFor(x => x.game !== null, 'game start');
    expect(new Set([s.players.white?.name, s.players.black?.name])).toEqual(new Set(['Moth', 'Wasp']));
    expect(s.players[host.color()]).toEqual({ name: 'Moth', rating: (await me(moth)).player!.rating });
    expect(s.ratings).toBeNull();
    await host.room.leave();
    await guest.room.leave();
  });

  it('does not rate a game that ends before both players have moved', async () => {
    const before = [await me(moth), await me(wasp)];
    const { white, black } = await startGame();
    await white.act({ type: 'move', uci: 'e2e4' });
    await black.act({ type: 'resign' });
    const end = await white.waitFor(s => s.game?.status === 'resign', 'game over');
    expect(end.ratings).toBeNull();
    expect([await me(moth), await me(wasp)]).toEqual(before);
    await white.room.leave();
    await black.room.leave();
  });

  it('updates both Elo ratings and records once when a game ends', async () => {
    const { white, black, whiteAccount, blackAccount } = await startGame();
    const [w0, b0] = [(await me(whiteAccount)).player!, (await me(blackAccount)).player!];
    await white.act({ type: 'move', uci: 'e2e4' });
    await black.act({ type: 'move', uci: 'e7e5' });
    await black.act({ type: 'resign' });
    const end = await black.waitFor(s => s.game?.status === 'resign', 'game over');

    expect(end.ratings).toEqual({ white: { before: w0.rating, after: w0.rating + 20 }, black: { before: b0.rating, after: b0.rating - 20 } });
    const [w1, b1] = [(await me(whiteAccount)).player!, (await me(blackAccount)).player!];
    expect(w1).toMatchObject({ rating: w0.rating + 20, games: w0.games + 1, wins: w0.wins + 1, losses: w0.losses });
    expect(b1).toMatchObject({ rating: b0.rating - 20, games: b0.games + 1, wins: b0.wins, losses: b0.losses + 1 });

    // Leaving afterwards (or anything else) must not rate the game again.
    await white.room.leave();
    await black.room.leave();
    await new Promise(r => setTimeout(r, 50));
    expect((await me(whiteAccount)).player).toEqual(w1);
  });

  it('rates a draw', async () => {
    const { white, black, whiteAccount } = await startGame();
    const w0 = (await me(whiteAccount)).player!;
    await white.act({ type: 'move', uci: 'd2d4' });
    await black.act({ type: 'move', uci: 'd7d5' });
    await white.act({ type: 'offerDraw' });
    await black.act({ type: 'acceptDraw' });
    const end = await white.waitFor(s => s.game?.status === 'drawAgreed', 'draw');
    expect(end.ratings).not.toBeNull();
    expect((await me(whiteAccount)).player).toMatchObject({ games: w0.games + 1, draws: w0.draws + 1 });
    await white.room.leave();
    await black.room.leave();
  });

  it("does not let another account resume someone's seat", async () => {
    const { a, b } = await startGame();
    const token = a.room.reconnectionToken;
    a.room.connection.close(4000); // abnormal close: the seat is held
    await b.waitFor(s => s.seats[a.color()] === 'away', 'seat held');
    const thief = await createAccount(ENDPOINT, 'Thief');
    const stolen = await clientFor(ENDPOINT, thief).reconnect(token).then(
      room => new Promise<string>(resolve => { room.onLeave(() => resolve('kicked')); setTimeout(() => resolve('seated'), 400); }),
      () => 'refused',
    );
    expect(stolen).not.toBe('seated');
    // The seat stays empty-handed: the thief never shows up as connected.
    await new Promise(r => setTimeout(r, 100));
    expect((await b.waitFor(() => true, 'snapshot')).seats[a.color()]).toBe('away');
    await b.room.leave();
  });
});

describe('leaderboard', () => {
  const leaderboard = async () => {
    const res = await fetch(`${ENDPOINT}${ApiPath.leaderboard}`); // no session: it's public
    expect(res.status).toBe(200);
    return ((await res.json()) as Leaderboard).players;
  };

  it('ranks players who have played rated games, highest rating first, with public fields only', async () => {
    await createAccount(ENDPOINT, 'Newt'); // no games yet: not listed
    const players = await leaderboard();
    const names = players.map(p => p.name);
    expect(names).toEqual(expect.arrayContaining(['Moth', 'Wasp']));
    expect(names).not.toContain('Newt');
    for (const p of players) expect(Object.keys(p).sort()).toEqual(['games', 'name', 'rank', 'rating']);
    const ratings = players.map(p => p.rating);
    expect(ratings).toEqual([...ratings].sort((x, y) => y - x));
    expect(players[0]!.rank).toBe(1);
  });

  it('updates as soon as a rated game ends', async () => {
    const before = await leaderboard();
    const { white, black, whiteAccount } = await startGame();
    await white.act({ type: 'move', uci: 'e2e4' });
    await black.act({ type: 'move', uci: 'e7e5' });
    await black.act({ type: 'resign' });
    await white.waitFor(s => s.game?.status === 'resign', 'game over');
    const after = await leaderboard();
    const games = (list: Leaderboard['players']) => list.find(p => p.name === whiteAccount.handle)!.games;
    expect(games(after)).toBe(games(before) + 1);
    await white.room.leave();
    await black.room.leave();
  });
});
