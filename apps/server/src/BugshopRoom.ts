import { randomInt } from 'node:crypto';
import { CloseCode, Room, ServerError, generateId, validate, type AuthContext, type Client, type Delayed } from '@colyseus/core';
import type { ByColor, Color } from 'chessops';
import { type GameState, applyAction, createGame } from '@bugshop/rules';
import {
  type ActionRejection,
  type GameMode,
  type GameSettings,
  type SeatStatus,
  type Snapshot,
  type TimeReply,
  type Welcome,
  Limits,
  Msg,
  settingsToConfig,
} from '@bugshop/protocol';
import { ActionSchema, CreateOptionsSchema, EmptySchema, JoinOptionsSchema } from './schemas.ts';
import { RateLimiter } from './rateLimit.ts';
import { serverNow } from './serverClock.ts';

const MINUTE = 60_000;

export interface RoomSettings {
  matchmakePerMinute: number;
  maxRooms: number;
  /** Close a room whose game never started after this long (unused invite links). */
  waitingTimeoutMs: number;
  /** Close a room this long after its game ended. */
  finishedTimeoutMs: number;
  /** Hard cap on a room's lifetime. */
  maxLifetimeMs: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  matchmakePerMinute: 30,
  maxRooms: 500,
  waitingTimeoutMs: 60 * MINUTE,
  finishedTimeoutMs: 10 * MINUTE,
  maxLifetimeMs: 24 * 60 * MINUTE,
};

/**
 * One Bugshop game between two players. The server is authoritative: every
 * action is validated (shape via zod, legality via @bugshop/rules) using the
 * server's clock, and clients only ever receive the resulting state.
 */
export class BugshopRoom extends Room {
  static settings: RoomSettings = DEFAULT_ROOM_SETTINGS;
  private static matchmakeLimiter: RateLimiter | undefined;
  private static activeRooms = 0;

  /** Apply settings (call once at startup, before listening). */
  static configure(settings: Partial<RoomSettings>): void {
    BugshopRoom.settings = { ...DEFAULT_ROOM_SETTINGS, ...settings };
    BugshopRoom.matchmakeLimiter?.dispose();
    BugshopRoom.matchmakeLimiter = new RateLimiter(BugshopRoom.settings.matchmakePerMinute, MINUTE);
  }

  maxClients = 2;
  /** Clients sending more than this are disconnected. Normal play needs ~1/s. */
  maxMessagesPerSecond = 10;

  private mode: GameMode = 'public';
  private settings!: GameSettings;
  private game: GameState | null = null;
  private colorOf = new Map<string, Color>();
  private seats: ByColor<SeatStatus> = { white: 'empty', black: 'empty' };
  private lifecycleTimer: Delayed | undefined;
  private counted = false;

  messages = {
    [Msg.action]: validate(ActionSchema, (client, action, ctx) => {
      const color = this.colorOf.get(client.sessionId);
      if (!color) return ctx.reject<ActionRejection>('not-a-player');
      if (!this.game) return ctx.reject<ActionRejection>('not-started');
      const res = applyAction(this.game, color, action, serverNow());
      if (!res.ok) return ctx.reject<ActionRejection>(res.error);
      this.setGame(res.state);
      return true;
    }),
    [Msg.time]: validate(EmptySchema, (): TimeReply => ({ serverNow: serverNow() })),
  };

  /**
   * Runs for every matchmaking request (create, joinOrCreate, joinById, reconnect),
   * before any room is created or seat reserved.
   */
  static async onAuth(_token: string, options: unknown, context: AuthContext) {
    const limiter = (BugshopRoom.matchmakeLimiter ??= new RateLimiter(BugshopRoom.settings.matchmakePerMinute, MINUTE));
    if (!limiter.take(context.ip ?? 'unknown')) throw new ServerError(429, 'Too many requests, slow down.');
    if (!JoinOptionsSchema.safeParse(options ?? {}).success) throw new ServerError(400, 'Invalid options.');
    return true;
  }

  async onCreate(options: unknown) {
    if (BugshopRoom.activeRooms >= BugshopRoom.settings.maxRooms) {
      throw new ServerError(503, 'Server is full, try again later.');
    }
    BugshopRoom.activeRooms++;
    this.counted = true;

    const created = CreateOptionsSchema.safeParse(options);
    if (!created.success) throw new ServerError(400, 'Invalid options.');
    const { mode, ...settings } = created.data;
    this.mode = mode;
    this.settings = settings;
    if (this.mode === 'private') {
      // The room ID is the invite secret: use a long random one (~95 bits).
      this.roomId = generateId(16);
      await this.setPrivate(true);
    }
    this.lifecycleTimer = this.clock.setTimeout(() => this.disconnect(), BugshopRoom.settings.waitingTimeoutMs);
    this.clock.setTimeout(() => this.disconnect(), BugshopRoom.settings.maxLifetimeMs);
  }

  onJoin(client: Client) {
    const free: Color[] = (['white', 'black'] as const).filter(c => this.seats[c] === 'empty');
    // maxClients = 2 and the room is locked once the game starts, so a free seat always exists here.
    const color = free.length === 2 ? (randomInt(2) === 0 ? 'white' : 'black') : free[0]!;
    this.colorOf.set(client.sessionId, color);
    this.seats[color] = 'connected';
    client.send(Msg.welcome, { color } satisfies Welcome);

    if (!this.game && this.seats.white !== 'empty' && this.seats.black !== 'empty') {
      // Both seats taken: start the game and keep the seats reserved for these two players.
      void this.lock();
      this.lifecycleTimer?.clear();
      this.game = createGame({ now: serverNow(), config: settingsToConfig(this.settings) });
    }
    this.broadcastSnapshot();
  }

  /** Connection lost without the player choosing to leave: hold their seat. */
  onDrop(client: Client) {
    const color = this.colorOf.get(client.sessionId);
    if (!color) return;
    if (!this.game && this.mode === 'public') {
      // Nobody is waiting on this player yet. Don't hold the seat, or matchmaking
      // would pair the next player with someone who is gone.
      this.seatLost(client.sessionId, false);
      return;
    }
    this.seats[color] = 'away';
    this.broadcastSnapshot();
    this.allowReconnection(client, Limits.reconnectSeconds).catch(() => this.seatLost(client.sessionId, false));
  }

  onReconnect(client: Client) {
    const color = this.colorOf.get(client.sessionId);
    if (!color) return;
    this.seats[color] = 'connected';
    client.send(Msg.welcome, { color } satisfies Welcome);
    this.broadcastSnapshot();
  }

  /** The player chose to leave (consented). */
  onLeave(client: Client, code?: number) {
    this.seatLost(client.sessionId, code === CloseCode.CONSENTED);
  }

  onDispose() {
    if (this.counted) BugshopRoom.activeRooms--;
  }

  /**
   * A player is gone for good. Before the game starts, their seat opens up again.
   * During the game, leaving on purpose resigns. A player who never came back
   * stays seated as `away`: their clock keeps running, which earns the opponent
   * coins toward Claim Victory, so absent players don't need special handling.
   */
  private seatLost(sessionId: string, consented: boolean) {
    const color = this.colorOf.get(sessionId);
    if (!color) return;
    if (!this.game) {
      this.colorOf.delete(sessionId);
      this.seats[color] = 'empty';
    } else {
      this.seats[color] = 'away';
      if (consented && this.game.status === 'playing') {
        const res = applyAction(this.game, color, { type: 'resign' }, serverNow());
        if (res.ok) this.game = res.state;
      }
    }
    this.afterGameChange();
  }

  private setGame(game: GameState) {
    this.game = game;
    this.afterGameChange();
  }

  private afterGameChange() {
    if (this.game && this.game.status !== 'playing' && !this.lifecycleTimer?.active) {
      this.lifecycleTimer = this.clock.setTimeout(() => this.disconnect(), BugshopRoom.settings.finishedTimeoutMs);
    }
    this.broadcastSnapshot();
  }

  private broadcastSnapshot() {
    const snapshot: Snapshot = {
      mode: this.mode,
      settings: this.settings,
      game: this.game,
      seats: { ...this.seats },
      serverNow: serverNow(),
    };
    this.broadcast(Msg.snapshot, snapshot);
  }

  /** Exposed for tests and logging. */
  static get roomCount() {
    return BugshopRoom.activeRooms;
  }
}
