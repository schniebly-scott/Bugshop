import { randomInt } from 'node:crypto';
import { CloseCode, Room, ServerError, generateId, validate, type AuthContext, type Client, type Delayed } from '@colyseus/core';
import type { ByColor, Color } from 'chessops';
import { type GameState, applyAction, createGame } from '@bugshop/rules';
import {
  type ActionRejection,
  type GameMode,
  type GameSettings,
  type PlayerInfo,
  type RatingChange,
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
import { redactFor } from './redact.ts';
import { serverNow } from './serverClock.ts';
import type { Accounts } from './http.ts';

const MINUTE = 60_000;

/** What a public lobby publishes about itself for the lobby list. */
export interface LobbyMetadata extends GameSettings {
  host: PlayerInfo;
}

/** Who a connection belongs to, as returned by `onAuth`. */
export interface Seated {
  userId: string;
}

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
  private static accounts: Accounts | undefined;
  private static originOk: (origin: string | null) => boolean = () => true;

  /** Apply settings (call once at startup, before listening). */
  static configure(
    settings: Partial<RoomSettings>,
    accounts?: Accounts,
    originOk?: (origin: string | null) => boolean,
  ): void {
    BugshopRoom.settings = { ...DEFAULT_ROOM_SETTINGS, ...settings };
    if (accounts) BugshopRoom.accounts = accounts;
    if (originOk) BugshopRoom.originOk = originOk;
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
  /** Account behind each connection, and behind each seat. */
  private userOf = new Map<string, string>();
  private userIds: ByColor<string | null> = { white: null, black: null };
  private players: ByColor<PlayerInfo | null> = { white: null, black: null };
  private ratings: ByColor<RatingChange> | null = null;
  private rated = false;
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
   * Checks every matchmaking request must pass, signed in or not: the per-IP
   * rate limit, and that a browser request comes from our own pages (the
   * session cookie rides along on cross-site requests too).
   */
  static checkRequest(context: AuthContext) {
    const limiter = (BugshopRoom.matchmakeLimiter ??= new RateLimiter(BugshopRoom.settings.matchmakePerMinute, MINUTE));
    if (!limiter.take(context.ip ?? 'unknown')) throw new ServerError(429, 'Too many requests, slow down.');
    if (!BugshopRoom.originOk(context.headers.get('origin'))) throw new ServerError(403, 'Forbidden origin.');
  }

  /**
   * Runs for every matchmaking request (create, joinOrCreate, joinById, reconnect),
   * before any room is created or seat reserved. Only signed-in accounts that have
   * chosen a player name may play; the session comes from the httpOnly cookie.
   */
  static async onAuth(_token: string, options: unknown, context: AuthContext): Promise<Seated> {
    BugshopRoom.checkRequest(context);
    if (!JoinOptionsSchema.safeParse(options ?? {}).success) throw new ServerError(400, 'Invalid options.');
    const accounts = BugshopRoom.accounts;
    if (!accounts) throw new ServerError(503, 'Accounts are not available.');
    const user = await accounts.auth.userFor(context.headers);
    if (!user) throw new ServerError(401, 'Sign in to play.');
    if (!accounts.players.get(user.id)) throw new ServerError(403, 'Choose a player name first.');
    return { userId: user.id };
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

  async onJoin(client: Client, options?: unknown, auth?: Seated) {
    const info = auth && BugshopRoom.accounts?.players.get(auth.userId);
    if (!auth || !info) throw new ServerError(401, 'Sign in to play.');
    // One account, one seat: nobody plays (or rates) against themselves.
    if (this.userIds.white === auth.userId || this.userIds.black === auth.userId) {
      throw new ServerError(409, 'You are already in this game.');
    }

    // The creator sends the game options; everyone else joins a specific game by
    // its ID (no options). This blocks `joinOrCreate` from dropping a player
    // into an arbitrary open lobby.
    const isCreator = this.colorOf.size === 0 && !this.game;
    const sentOptions = !!options && typeof options === 'object' && Object.keys(options).length > 0;
    if (!isCreator && sentOptions) throw new ServerError(400, 'Join games by their ID.');

    const free: Color[] = (['white', 'black'] as const).filter(c => this.seats[c] === 'empty');
    // maxClients = 2 and the room is locked once the game starts, so a free seat always exists here.
    const color = free.length === 2 ? (randomInt(2) === 0 ? 'white' : 'black') : free[0]!;
    this.colorOf.set(client.sessionId, color);
    this.userOf.set(client.sessionId, auth.userId);
    this.userIds[color] = auth.userId;
    this.players[color] = { name: info.name, rating: info.rating };
    this.seats[color] = 'connected';
    client.send(Msg.welcome, { color } satisfies Welcome);
    // Public games are listed in the lobby list with their settings and host.
    if (isCreator && this.mode === 'public') {
      await this.setMetadata({ ...this.settings, host: this.players[color] } satisfies LobbyMetadata);
    }

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
    // A seat can only be resumed by the account that took it.
    const auth = client.auth as Seated | undefined;
    if (auth && auth.userId !== this.userOf.get(client.sessionId)) {
      client.leave(CloseCode.WITH_ERROR);
      return;
    }
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
   * coins toward Squish, so absent players don't need special handling.
   */
  private seatLost(sessionId: string, consented: boolean) {
    const color = this.colorOf.get(sessionId);
    if (!color) return;
    if (!this.game) {
      this.colorOf.delete(sessionId);
      this.userOf.delete(sessionId);
      this.userIds[color] = null;
      this.players[color] = null;
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
    if (this.game && this.game.status !== 'playing') {
      this.rateOnce(this.game);
      if (!this.lifecycleTimer?.active) {
        this.lifecycleTimer = this.clock.setTimeout(() => this.disconnect(), BugshopRoom.settings.finishedTimeoutMs);
      }
    }
    this.broadcastSnapshot();
  }

  /**
   * Update both players' Elo when the game ends, exactly once. A game that ends
   * before each side has made a move (someone left at the start) is not rated,
   * so opening and abandoning games can't be used to move ratings.
   */
  private rateOnce(game: GameState) {
    if (this.rated) return;
    this.rated = true;
    const moved = (c: Color) => game.history.some(e => e.type === 'move' && e.by === c);
    const { white, black } = this.userIds;
    if (!white || !black || !moved('white') || !moved('black')) return;
    try {
      this.ratings =
        BugshopRoom.accounts?.players.recordGame({
          whiteId: white,
          blackId: black,
          winner: game.winner,
          status: game.status,
          mode: this.mode,
          now: serverNow(),
        }) ?? null;
    } catch (e) {
      // The game result stands even if the rating could not be saved.
      console.error('Could not record a game result:', e instanceof Error ? e.message : 'unknown error');
    }
  }

  /** Send each player their own view: the opponent's pocket stays secret. */
  private broadcastSnapshot() {
    const now = serverNow();
    for (const client of this.clients) {
      const color = this.colorOf.get(client.sessionId);
      if (!color) continue;
      const snapshot: Snapshot = {
        mode: this.mode,
        settings: this.settings,
        game: this.game && redactFor(this.game, color),
        seats: { ...this.seats },
        players: { ...this.players },
        ratings: this.ratings,
        serverNow: now,
      };
      client.send(Msg.snapshot, snapshot);
    }
  }

  /** Exposed for tests and logging. */
  static get roomCount() {
    return BugshopRoom.activeRooms;
  }
}
