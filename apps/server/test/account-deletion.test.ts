import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Snapshot, type Welcome, ApiPath, DEFAULT_SETTINGS, Msg, ROOM_NAME } from '@bugshop/protocol';
import { createGameServer } from '../src/app.ts';
import { DELETED_PLAYER } from '../src/db.ts';
import { loadEnv } from '../src/env.ts';
import { type TestAccount, WEB_ORIGIN, clientFor, createAccount, postJson } from './helpers.ts';

const PORT = 35000 + Math.floor(Math.random() * 2000);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const DIR = mkdtempSync(join(tmpdir(), 'bugshop-delete-'));
const DB_PATH = join(DIR, 'test.sqlite');
const PASSWORD = 'correct horse battery'; // what createAccount uses
let server: ReturnType<typeof createGameServer>;

beforeAll(async () => {
  server = createGameServer(
    loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGINS: WEB_ORIGIN, MATCHMAKE_PER_MINUTE: '1000', DATABASE_PATH: DB_PATH }),
  );
  await server.listen(PORT, '127.0.0.1');
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(DIR, { recursive: true, force: true });
});

/** Read the live database directly, to check what deletion leaves behind. */
const query = (sql: string, ...params: string[]) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return db.prepare(sql).all(...params) as Record<string, unknown>[];
  } finally {
    db.close();
  }
};
const userIdOf = (email: string) => query('SELECT id FROM user WHERE email = ?', email)[0]!.id as string;

const deleteAccount = (account: TestAccount, body: object, headers: Record<string, string> = {}) =>
  postJson(`${ENDPOINT}${ApiPath.auth}/delete-user`, body, { Cookie: account.cookie, ...headers });

const me = (account: TestAccount) => fetch(`${ENDPOINT}${ApiPath.me}`, { headers: { Cookie: account.cookie } });

/** Play a quick rated game between two accounts (each side moves once, then `loser` resigns). */
const playRatedGame = async (loser: TestAccount, winner: TestAccount) => {
  const join = (room: Awaited<ReturnType<ReturnType<typeof clientFor>['create']>>) => {
    room.reconnection.enabled = false;
    const seat = { room, color: undefined as Welcome['color'] | undefined, snapshot: undefined as Snapshot | undefined };
    room.onMessage(Msg.welcome, (w: Welcome) => (seat.color = w.color));
    room.onMessage(Msg.snapshot, (s: Snapshot) => (seat.snapshot = s));
    return seat;
  };
  const waitFor = async (pred: () => boolean) => {
    for (let i = 0; i < 300 && !pred(); i++) await new Promise(r => setTimeout(r, 10));
    if (!pred()) throw new Error('timed out');
  };
  const a = join(await clientFor(ENDPOINT, loser).create(ROOM_NAME, { mode: 'private', ...DEFAULT_SETTINGS }));
  const b = join(await clientFor(ENDPOINT, winner).joinById(a.room.roomId));
  await waitFor(() => !!(a.snapshot?.game && b.snapshot?.game && a.color && b.color));
  const white = a.color === 'white' ? a : b;
  const black = white === a ? b : a;
  await white.room.request(Msg.action, { type: 'move', uci: 'e2e4' });
  await black.room.request(Msg.action, { type: 'move', uci: 'e7e5' });
  await a.room.request(Msg.action, { type: 'resign' });
  await waitFor(() => b.snapshot?.game?.status === 'resign');
  await new Promise(r => setTimeout(r, 50));
  await a.room.leave();
  await b.room.leave();
};

describe('deleting an account', () => {
  it('needs the password, refuses cross-site requests, then removes everything', async () => {
    const moth = await createAccount(ENDPOINT, 'Moth');
    const wasp = await createAccount(ENDPOINT, 'Wasp');
    await playRatedGame(moth, wasp);
    const mothId = userIdOf(moth.email);
    const waspId = userIdOf(wasp.email);
    expect(query('SELECT * FROM game_result WHERE white_id = ? OR black_id = ?', mothId, mothId)).toHaveLength(1);

    // Wrong password: refused, nothing deleted.
    const wrong = await deleteAccount(moth, { password: 'not the password' });
    expect(wrong.status).toBe(400);
    expect((await me(moth)).status).toBe(200);

    // Another website can't make a signed-in browser delete its account.
    const crossSite = await deleteAccount(moth, { password: PASSWORD }, { Origin: 'https://evil.example' });
    expect(crossSite.ok).toBe(false);
    expect((await me(moth)).status).toBe(200);

    // The real thing.
    const res = await deleteAccount(moth, { password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, message: 'User deleted' });

    // Signed out everywhere, and can't sign back in.
    expect((await me(moth)).status).toBe(401);
    const signIn = await postJson(`${ENDPOINT}${ApiPath.auth}/sign-in/email`, { email: moth.email, password: PASSWORD });
    expect(signIn.ok).toBe(false);

    // Nothing left that points at the account.
    for (const table of ['session', 'account']) {
      expect(query(`SELECT * FROM ${table} WHERE userId = ?`, mothId)).toHaveLength(0);
    }
    expect(query('SELECT * FROM user WHERE id = ?', mothId)).toHaveLength(0);
    expect(query('SELECT * FROM player WHERE user_id = ?', mothId)).toHaveLength(0);
    expect(query('SELECT * FROM game_result WHERE white_id = ? OR black_id = ?', mothId, mothId)).toHaveLength(0);

    // The opponent keeps their history and record; the game now shows a deleted player.
    const [game] = query('SELECT white_id, black_id FROM game_result');
    expect([game!.white_id, game!.black_id].sort()).toEqual([DELETED_PLAYER, waspId].sort());
    expect(query('SELECT games, wins FROM player WHERE user_id = ?', waspId)).toEqual([{ games: 1, wins: 1 }]);
    expect((await me(wasp)).status).toBe(200);

    // The player name is free again.
    await expect(createAccount(ENDPOINT, 'Moth')).resolves.toMatchObject({ handle: 'Moth' });
  });

  it('without a password, only a recent sign-in may delete (accounts that sign in with Google)', async () => {
    const beetle = await createAccount(ENDPOINT, 'Beetle');
    const id = userIdOf(beetle.email);
    // Make the session look two days old.
    const db = new DatabaseSync(DB_PATH);
    db.prepare('UPDATE session SET createdAt = ? WHERE userId = ?').run(new Date(Date.now() - 2 * 86_400_000).toISOString(), id);
    db.close();

    const stale = await deleteAccount(beetle, {});
    expect(stale.status).toBe(400);
    expect(await stale.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect((await me(beetle)).status).toBe(200);

    // Signing in again makes the session fresh, and then it works.
    const signIn = await postJson(`${ENDPOINT}${ApiPath.auth}/sign-in/email`, { email: beetle.email, password: PASSWORD });
    const fresh = { ...beetle, cookie: signIn.headers.getSetCookie().map(c => c.split(';')[0]!).join('; ') };
    expect((await deleteAccount(fresh, {})).status).toBe(200);
    expect(query('SELECT * FROM user WHERE id = ?', id)).toHaveLength(0);
  });

  it('refuses without a session', async () => {
    const res = await postJson(`${ENDPOINT}${ApiPath.auth}/delete-user`, { password: PASSWORD });
    expect(res.status).toBe(401);
  });
});
