import { Client, type Room } from '@colyseus/sdk';
import type { Color } from 'chessops';
import { type Action, type GameState, applyAction } from '@bugshop/rules';
import { type ActionRejection, type GameMode, type Snapshot, type TimeReply, type Welcome, Msg, ROOM_NAME } from '@bugshop/protocol';

/** Public game server URL (not a secret; baked into the bundle at build time). */
export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:2567';

export type SessionStatus = 'connecting' | 'waiting' | 'playing' | 'finished' | 'reconnecting' | 'closed' | 'error';

export interface SessionView {
  status: SessionStatus;
  roomId?: string;
  mode?: GameMode;
  color?: Color;
  /** Last state confirmed by the server. */
  snapshot?: Snapshot;
  /** What to display: the server state plus our own not-yet-confirmed action. */
  game: GameState | null;
  /** serverTime ≈ Date.now() + offsetMs */
  offsetMs: number;
  rejection: ActionRejection | 'network' | null;
  error?: string;
}

const tokenKey = (roomId: string) => `bugshop:reconnect:${roomId}`;
const storage = {
  get(roomId: string): string | null {
    try { return sessionStorage.getItem(tokenKey(roomId)); } catch { return null; }
  },
  set(roomId: string, token: string) {
    try { sessionStorage.setItem(tokenKey(roomId), token); } catch { /* private mode: no resume after reload */ }
  },
  clear(roomId: string) {
    try { sessionStorage.removeItem(tokenKey(roomId)); } catch { /* ignore */ }
  },
};

const statusOf = (s: Snapshot): SessionStatus => (!s.game ? 'waiting' : s.game.status === 'playing' ? 'playing' : 'finished');

/**
 * One online game connection. The server decides everything; this class keeps
 * the latest server snapshot, estimates the server clock, and shows our own
 * actions immediately (validated locally with the same rules) until the server
 * confirms or rejects them.
 */
export class OnlineSession {
  private view: SessionView = { status: 'connecting', game: null, offsetMs: 0, rejection: null };
  private listeners = new Set<() => void>();
  private room: Room | undefined;
  private leaving = false;
  readonly target: string;

  private constructor(target: string) {
    this.target = target;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getView = () => this.view;

  private set(patch: Partial<SessionView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach(l => l());
  }

  serverNow = () => Date.now() + this.view.offsetMs;

  /** Join (or resume) a game by room ID, e.g. from an invite link. */
  static open(roomId: string): OnlineSession {
    const s = new OnlineSession(roomId);
    void s.connect(async client => {
      const token = storage.get(roomId);
      if (token) {
        try {
          return await client.reconnect(token);
        } catch (e) {
          console.warn('Could not resume the previous seat; joining as a new player.', e);
          storage.clear(roomId);
        }
      }
      return client.joinById(roomId);
    });
    return s;
  }

  /** Start a game: public matchmaking or a private invite room. */
  static async start(mode: GameMode): Promise<OnlineSession> {
    const s = new OnlineSession(`new:${mode}`);
    await s.connect(client => (mode === 'public' ? client.joinOrCreate(ROOM_NAME, { mode }) : client.create(ROOM_NAME, { mode })));
    return s;
  }

  private async connect(join: (client: Client) => Promise<Room>) {
    try {
      const room = await join(new Client(SERVER_URL));
      this.attach(room);
    } catch (e) {
      this.set({ status: 'error', error: describeJoinError(e) });
    }
  }

  private attach(room: Room) {
    this.room = room;
    storage.set(room.roomId, room.reconnectionToken);
    this.set({ roomId: room.roomId, status: 'waiting' });

    room.onMessage(Msg.welcome, (w: Welcome) => this.set({ color: w.color }));
    room.onMessage(Msg.snapshot, (s: Snapshot) => this.set({ snapshot: s, game: s.game, mode: s.mode, status: statusOf(s) }));
    room.onDrop(() => this.set({ status: 'reconnecting' }));
    room.onReconnect(() => {
      storage.set(room.roomId, room.reconnectionToken);
      if (this.view.snapshot) this.set({ status: statusOf(this.view.snapshot) });
      void this.syncClock();
    });
    room.onLeave(() => {
      // Keep the reconnection token unless we left on purpose: when the tab
      // reloads, this page's room "leaves" while unloading, and the reloaded
      // page needs the token to take its seat back. A stale token is harmless:
      // the server rejects it and we fall back to joining normally.
      if (!this.leaving) this.set({ status: 'closed', error: 'Disconnected from the game.' });
    });
    void this.syncClock();
  }

  /** Estimate the server clock offset from a few round trips, keeping the fastest. */
  private async syncClock() {
    let best: { rtt: number; offset: number } | undefined;
    for (let i = 0; i < 4; i++) {
      const t0 = Date.now();
      try {
        const { serverNow } = (await this.room!.request(Msg.time)) as TimeReply;
        const t1 = Date.now();
        const sample = { rtt: t1 - t0, offset: serverNow - (t0 + t1) / 2 };
        if (!best || sample.rtt < best.rtt) best = sample;
      } catch {
        return;
      }
    }
    if (best) this.set({ offsetMs: best.offset });
  }

  /**
   * Validate locally, show the result at once, then let the server decide.
   * Returns false (and sets `rejection`) if the action is illegal locally.
   */
  act(action: Action): boolean {
    const { color, game } = this.view;
    if (!this.room || !color || !game) return false;
    const res = applyAction(game, color, action, this.serverNow());
    if (!res.ok) {
      this.set({ rejection: res.error });
      return false;
    }
    this.set({ game: res.state, rejection: null });
    this.room.request(Msg.action, action).catch((e: { reason?: ActionRejection }) => {
      // Server said no (or the request failed): fall back to the confirmed state.
      this.set({ game: this.view.snapshot?.game ?? null, rejection: e?.reason ?? 'network' });
    });
    return true;
  }

  clearRejection() {
    this.set({ rejection: null });
  }

  /** Leave on purpose. During a game this resigns (server rule). */
  async leave() {
    this.leaving = true;
    if (this.room) {
      storage.clear(this.room.roomId);
      await this.room.leave(true).catch(() => undefined);
    }
    this.set({ status: 'closed' });
  }
}

const describeJoinError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : '';
  if (/not found|locked/i.test(msg)) return 'This game is full, finished or no longer exists.';
  if (/too many/i.test(msg)) return 'Too many requests. Wait a minute and try again.';
  if (/full/i.test(msg)) return 'The server is full right now. Try again later.';
  return 'Could not connect to the game server.';
};

// The current game (one per tab). Kept outside React so StrictMode's double
// effects and page navigation don't open duplicate connections.
let current: OnlineSession | null = null;

export const sessionFor = (roomId: string): OnlineSession => {
  const v = current?.getView();
  if (current && (current.target === roomId || v?.roomId === roomId) && v?.status !== 'closed') return current;
  current = OnlineSession.open(roomId);
  return current;
};

export const startSession = async (mode: GameMode): Promise<OnlineSession> => {
  current = await OnlineSession.start(mode);
  return current;
};
