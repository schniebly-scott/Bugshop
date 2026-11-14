import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import type { Color } from 'chessops';
import {
  type GameMode,
  type GameSettings,
  type LobbyListing,
  type Snapshot,
  type Welcome,
  DEFAULT_SETTINGS,
  LOBBY_LIST_ROOM_NAME,
  Msg,
  ROOM_NAME,
} from '@bugshop/protocol';
import { createGameServer } from '../src/app.ts';
import { BugshopRoom } from '../src/BugshopRoom.ts';
import { loadEnv } from '../src/env.ts';
import { advanceServerClockForTests } from '../src/serverClock.ts';

const PORT = 31000 + Math.floor(Math.random() * 2000);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const MIN = 60_000;
let server: ReturnType<typeof createGameServer>;

beforeAll(async () => {
  server = createGameServer(
    loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGINS: 'http://localhost:5173', MATCHMAKE_PER_MINUTE: '1000' }),
  );
  await server.listen(PORT, '127.0.0.1');
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

/** A connected player: their room plus the latest messages they received. */
interface Player {
  room: Room;
  color: () => Color;
  snapshot: () => Snapshot;
  waitFor(pred: (s: Snapshot) => boolean, what?: string): Promise<Snapshot>;
  left: Promise<number>;
}

const until = async <T,>(get: () => T | undefined, what: string, timeoutMs = 3000): Promise<T> => {
  const start = Date.now();
  for (;;) {
    const v = get();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 10));
  }
};

const track = (room: Room): Player => {
  room.reconnection.enabled = false; // tests drive reconnection explicitly
  let welcome: Welcome | undefined;
  let snapshot: Snapshot | undefined;
  room.onMessage(Msg.welcome, (w: Welcome) => (welcome = w));
  room.onMessage(Msg.snapshot, (s: Snapshot) => (snapshot = s));
  const left = new Promise<number>(resolve => room.onLeave(code => resolve(code)));
  return {
    room,
    color: () => welcome!.color,
    snapshot: () => snapshot!,
    waitFor: (pred, what = 'snapshot') => until(() => (snapshot && pred(snapshot) ? snapshot : undefined), what),
    left,
  };
};

const newClient = () => new Client(ENDPOINT);
/** Full create options, as the web client sends them. */
const opts = (mode: GameMode, settings: Partial<GameSettings> = {}) => ({ mode, ...DEFAULT_SETTINGS, ...settings });

/** Two players in one private game, both welcomed and the game started. */
const startPrivateGame = async () => {
  const a = track(await newClient().create(ROOM_NAME, opts('private')));
  const b = track(await newClient().joinById(a.room.roomId));
  await a.waitFor(s => s.game !== null, 'game start');
  await b.waitFor(s => s.game !== null, 'game start');
  const white = a.color() === 'white' ? a : b;
  const black = white === a ? b : a;
  return { a, b, white, black };
};

const act = (p: Player, action: object) => p.room.request(Msg.action, action);
/** The reason a request was rejected with (`ctx.reject(reason)` on the server). */
const rejection = (p: Player, action: object) =>
  act(p, action).then(
    () => 'resolved',
    (e: Error & { reason?: unknown }) => e.reason,
  );

describe('private invite rooms', () => {
  it('creates a hidden room with a long random ID that a second player joins by link', async () => {
    const { a, b, white, black } = await startPrivateGame();
    expect(a.room.roomId).toMatch(/^[\w-]{16}$/);
    expect(b.room.roomId).toBe(a.room.roomId);
    expect(new Set([a.color(), b.color()])).toEqual(new Set(['white', 'black']));
    expect(white.snapshot()).toMatchObject({ mode: 'private', seats: { white: 'connected', black: 'connected' } });
    await a.room.leave();
    await b.room.leave();
    void black;
  });

  it('refuses a third player once the game has started', async () => {
    const { a, b } = await startPrivateGame();
    await expect(newClient().joinById(a.room.roomId)).rejects.toThrow();
    await a.room.leave();
    await b.room.leave();
  });
});

/** A visitor watching the live lobby list. */
const watchLobbies = async () => {
  const room = await newClient().joinOrCreate(LOBBY_LIST_ROOM_NAME);
  room.reconnection.enabled = false;
  let list: LobbyListing[] | undefined;
  room.onMessage(Msg.lobbies, (l: LobbyListing[]) => (list = l));
  const left = new Promise<number>(resolve => room.onLeave(code => resolve(code)));
  return {
    room,
    left,
    waitFor: (pred: (l: LobbyListing[]) => boolean, what = 'lobby list') => until(() => (list && pred(list) ? list : undefined), what),
  };
};
const listed = (l: LobbyListing[], roomId: string) => l.some(x => x.roomId === roomId);

describe('lobby list', () => {
  it('lists open public lobbies with their settings, but not private or full games', async () => {
    const watcher = await watchLobbies();
    await watcher.waitFor(() => true);
    const pub = track(await newClient().create(ROOM_NAME, opts('public', { secondsPerCoin: 25, squishPrice: 20 })));
    const priv = track(await newClient().create(ROOM_NAME, opts('private')));

    const list = await watcher.waitFor(l => listed(l, pub.room.roomId), 'public lobby listed');
    const entry = list.find(x => x.roomId === pub.room.roomId)!;
    expect(entry.settings).toEqual({ secondsPerCoin: 25, squishPrice: 20 });
    expect(Object.keys(entry).sort()).toEqual(['createdAt', 'roomId', 'settings']); // nothing internal leaks
    expect(listed(list, priv.room.roomId)).toBe(false);

    // Someone joins from the list: the game starts and the lobby disappears.
    const joiner = track(await newClient().joinById(pub.room.roomId));
    await joiner.waitFor(s => s.game !== null, 'game start');
    await watcher.waitFor(l => !listed(l, pub.room.roomId), 'full lobby removed');

    for (const p of [pub, priv, joiner]) await p.room.leave();
    await watcher.room.leave();
  });

  it('removes a lobby whose creator closes the tab while waiting', async () => {
    const watcher = await watchLobbies();
    const ghost = track(await newClient().create(ROOM_NAME, opts('public')));
    await watcher.waitFor(l => listed(l, ghost.room.roomId), 'lobby listed');
    await ghost.room.leave(false); // tab closed, not a deliberate leave
    await watcher.waitFor(l => !listed(l, ghost.room.roomId), 'ghost lobby removed');
    await expect(newClient().joinById(ghost.room.roomId)).rejects.toThrow();
    await watcher.room.leave();
  });

  it('only lets players join a chosen lobby by its ID, not a random one', async () => {
    const pub = track(await newClient().create(ROOM_NAME, opts('public')));
    const sneaky = await newClient().joinOrCreate(ROOM_NAME, opts('public')).then(r => r, () => null);
    expect(sneaky?.roomId).not.toBe(pub.room.roomId);
    await sneaky?.leave();
    await pub.room.leave();
  });

  it('is receive-only: options or messages from visitors are refused', async () => {
    await expect(newClient().joinOrCreate(LOBBY_LIST_ROOM_NAME, { filter: { name: 'x' } })).rejects.toThrow(/Invalid options/);
    const watcher = await watchLobbies();
    watcher.room.send('filter', { metadata: {} });
    await expect(watcher.left).resolves.toBeGreaterThan(1000);
  });
});

describe('per-game settings', () => {
  it('uses the creator\'s coin rate and Squish price for the game', async () => {
    const a = track(await newClient().create(ROOM_NAME, opts('private', { secondsPerCoin: 10, squishPrice: 10 })));
    await a.waitFor(s => s.settings !== undefined, 'waiting snapshot');
    expect(a.snapshot().settings).toEqual({ secondsPerCoin: 10, squishPrice: 10 });
    const b = track(await newClient().joinById(a.room.roomId));
    const s = await b.waitFor(s => s.game !== null, 'game start');
    expect(s.game!.config).toMatchObject({ msPerCoin: 10_000, squishPrice: 10 });

    // 100 s of White's time = 10 coins for Black at 10 s/coin: enough to Squish.
    const white = a.color() === 'white' ? a : b;
    const black = white === a ? b : a;
    advanceServerClockForTests(99_000);
    expect(await rejection(black, { type: 'squish' })).toBe('not-enough-coins');
    advanceServerClockForTests(1_000);
    await expect(act(black, { type: 'squish' })).resolves.toBe(true);
    await a.room.leave();
    await b.room.leave();
  });

  it('accepts only the preset values', async () => {
    for (const bad of [{ secondsPerCoin: 15 }, { secondsPerCoin: 600 }, { squishPrice: 25 }, { squishPrice: 5 }]) {
      await expect(newClient().create(ROOM_NAME, opts('private', bad))).rejects.toThrow(/Invalid options/);
    }
  });
});

describe('hidden pockets', () => {
  it("never sends a player the opponent's pocket, purchases or spending until the game ends", async () => {
    const { white, black } = await startPrivateGame();
    await act(white, { type: 'move', uci: 'e2e4' });
    advanceServerClockForTests(3 * MIN + 1000); // Black thinks; White earns 3 coins
    await act(white, { type: 'buy', role: 'knight' });
    await white.waitFor(s => s.game!.history.some(e => e.type === 'buy'), 'own purchase visible');
    expect(white.snapshot().game!.fen).toContain('[N]');
    await new Promise(r => setTimeout(r, 100)); // Black's copy of the same broadcast

    const blackView = black.snapshot().game!;
    expect(blackView.fen).toContain('[]');
    expect(blackView.history.some(e => e.type === 'buy')).toBe(false);
    expect(blackView.spent.white).toBe(0);
    expect(blackView.positions).toEqual([]);
    expect(JSON.stringify(black.snapshot())).not.toContain('"role"'); // no purchase records at all

    // When the game ends, everything is revealed.
    await act(black, { type: 'resign' });
    const end = await black.waitFor(s => s.game!.status !== 'playing', 'game over');
    expect(end.game!.fen).toContain('[N]');
    expect(end.game!.spent.white).toBe(3);
    await white.room.leave();
    await black.room.leave();
  });
});

describe('server-authoritative play', () => {
  it('applies legal actions and broadcasts the result to both players', async () => {
    const { white, black } = await startPrivateGame();
    await expect(act(white, { type: 'move', uci: 'e2e4' })).resolves.toBe(true);
    await black.waitFor(s => s.game!.history.length === 1, 'move broadcast');
    expect(black.snapshot().game!.fen.split(' ')[1]).toBe('b');
    await white.room.leave();
    await black.room.leave();
  });

  it('rejects illegal and out-of-turn actions with the rules reason', async () => {
    const { white, black } = await startPrivateGame();
    expect(await rejection(black, { type: 'move', uci: 'e7e5' })).toBe('not-your-turn');
    expect(await rejection(white, { type: 'move', uci: 'e2e5' })).toBe('illegal-move');
    expect(await rejection(white, { type: 'buy', role: 'queen' })).toBe('not-enough-coins');
    await white.room.leave();
    await black.room.leave();
  });

  it('earns coins from the opponent clock on the server, allowing off-turn purchases and drops', async () => {
    const { white, black } = await startPrivateGame();
    await act(white, { type: 'move', uci: 'e2e4' });
    advanceServerClockForTests(3 * MIN + 1000); // Black thinks for 3 minutes
    await expect(act(white, { type: 'buy', role: 'knight' })).resolves.toBe(true); // White buys on Black's turn
    await act(black, { type: 'move', uci: 'e7e5' });
    await expect(act(white, { type: 'move', uci: 'N@f3' })).resolves.toBe(true);
    const own = await white.waitFor(s => s.game!.history.length === 4, 'drop broadcast');
    expect(own.game!.history.map(e => e.type)).toEqual(['move', 'buy', 'move', 'move']);
    expect(own.game!.spent.white).toBe(3);
    // Black never saw the purchase, only the drop itself.
    const theirs = await black.waitFor(s => s.game!.history.length === 3, 'drop seen by black');
    expect(theirs.game!.history.at(-1)).toMatchObject({ type: 'move', san: 'N@f3' });
    await white.room.leave();
    await black.room.leave();
  });

  it('lets the waiting player buy Squish once the opponent has used enough time', async () => {
    const { white, black } = await startPrivateGame();
    expect(await rejection(black, { type: 'squish' })).toBe('not-enough-coins');
    advanceServerClockForTests(30 * MIN); // White (to move) is absent for 30 minutes
    await expect(act(black, { type: 'squish' })).resolves.toBe(true);
    const s = await white.waitFor(s => s.game!.status !== 'playing', 'game over');
    expect(s.game).toMatchObject({ status: 'squish', winner: 'black' });
    await white.room.leave();
    await black.room.leave();
  });
});

describe('malicious or malformed clients', () => {
  it('disconnects a client that sends a payload outside the schema', async () => {
    const { white, black } = await startPrivateGame();
    // Trying to act as the other color: actions carry no color, extra keys are refused.
    white.room.send(Msg.action, { type: 'resign', color: 'black' });
    await expect(white.left).resolves.toBeGreaterThan(1000);
    expect(black.snapshot().game!.status).toBe('playing');
    await black.room.leave();
  });

  it('disconnects a client that sends junk move strings or unknown message types', async () => {
    const { white, black } = await startPrivateGame();
    white.room.send(Msg.action, { type: 'move', uci: '<script>' });
    await expect(white.left).resolves.toBeGreaterThan(1000);
    black.room.send('give-me-coins', { amount: 999 });
    await expect(black.left).resolves.toBeGreaterThan(1000);
  });

  it('disconnects a client that floods messages', async () => {
    const { white, black } = await startPrivateGame();
    for (let i = 0; i < 30; i++) white.room.send(Msg.time);
    await expect(white.left).resolves.toBeGreaterThan(1000);
    await black.room.leave();
  });

  it('rejects invalid room options', async () => {
    await expect(newClient().create(ROOM_NAME, { mode: 'secret' })).rejects.toThrow(/Invalid options/);
    await expect(newClient().create(ROOM_NAME, { ...opts('public'), admin: true })).rejects.toThrow(/Invalid options/);
    // Settings are required (matchmaking filters on them) and bounded.
    await expect(newClient().create(ROOM_NAME, { mode: 'public' })).rejects.toThrow(/Invalid options/);
    for (const bad of [{ secondsPerCoin: 0 }, { secondsPerCoin: 1e9 }, { secondsPerCoin: 30.5 }, { squishPrice: -1 }, { squishPrice: '30' }]) {
      await expect(newClient().create(ROOM_NAME, { ...opts('private'), ...bad })).rejects.toThrow(/Invalid options/);
    }
  });

  it('rate-limits matchmaking per IP', async () => {
    BugshopRoom.configure({ matchmakePerMinute: 3 });
    try {
      const rooms: Room[] = [];
      for (let i = 0; i < 3; i++) rooms.push(await newClient().create(ROOM_NAME, opts('private')));
      await expect(newClient().create(ROOM_NAME, opts('private'))).rejects.toThrow(/Too many requests/);
      for (const r of rooms) await r.leave();
    } finally {
      BugshopRoom.configure({ matchmakePerMinute: 1000 });
    }
  });

  it('refuses WebSocket upgrades and CORS for foreign browser origins', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${ENDPOINT}/some-room/some-session`, {
        headers: {
          Origin: 'https://evil.example',
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        },
      });
      req.on('response', res => resolve(res.statusCode!));
      req.on('upgrade', () => resolve(101));
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);

    const preflight = (origin: string) =>
      fetch(`${ENDPOINT}/matchmake/create/${ROOM_NAME}`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      });
    const evil = await preflight('https://evil.example');
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    expect(evil.headers.get('access-control-allow-credentials')).toBeNull();
    const ok = await preflight('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
  });
});

describe('disconnects', () => {
  it('holds a dropped player seat and lets them reconnect with the same color', async () => {
    const { white, black } = await startPrivateGame();
    const token = black.room.reconnectionToken;
    await black.room.leave(false); // abrupt drop, not a choice to leave
    await white.waitFor(s => s.seats.black === 'away', 'black away');

    const back = track(await newClient().reconnect(token));
    await until(() => { try { return back.color(); } catch { return undefined; } }, 'welcome');
    expect(back.color()).toBe('black');
    await white.waitFor(s => s.seats.black === 'connected', 'black back');
    await expect(act(white, { type: 'move', uci: 'e2e4' })).resolves.toBe(true);
    await expect(act(back, { type: 'move', uci: 'e7e5' })).resolves.toBe(true);
    await white.room.leave();
    await back.room.leave();
  });

  it('treats choosing to leave mid-game as resigning', async () => {
    const { white, black } = await startPrivateGame();
    await white.room.leave(); // consented
    const s = await black.waitFor(s => s.game!.status !== 'playing', 'game over');
    expect(s.game).toMatchObject({ status: 'resign', winner: 'black' });
    await black.room.leave();
  });
});
