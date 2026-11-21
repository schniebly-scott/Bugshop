import type { ByColor, Color } from 'chessops';
import type { BugshopConfig, GameState, RuleError } from '@bugshop/rules';

/** Colyseus room name for Bugshop games. */
export const ROOM_NAME = 'bugshop';
/** Colyseus room name for the live list of open public lobbies. */
export const LOBBY_LIST_ROOM_NAME = 'lobbies';

/**
 * `public`: an open lobby, listed for everyone to browse and join.
 * `private`: unlisted; joined only through its invite link.
 * Both are joined with `joinById`.
 */
export type GameMode = 'public' | 'private';

/** Per-game settings chosen by whoever opens the game; shown in the lobby list. */
export interface GameSettings {
  /** Seconds of opponent thinking time that earn one coin. */
  secondsPerCoin: number;
  /** Coins needed to buy Squish. */
  squishPrice: number;
}

export const DEFAULT_SETTINGS: GameSettings = { secondsPerCoin: 25, squishPrice: 20 };

/**
 * The only allowed values. A small fixed set keeps lobbies easy to scan and
 * stops players being spread over endless combinations. The server enforces
 * these; the UI shows them as buttons.
 */
export const SETTINGS_OPTIONS = {
  secondsPerCoin: [10, 25, 30, 45, 60],
  squishPrice: [10, 20, 30],
} as const satisfies Record<keyof GameSettings, readonly number[]>;

export const isValidSettings = (s: GameSettings): boolean =>
  (Object.keys(SETTINGS_OPTIONS) as (keyof GameSettings)[]).every(k =>
    (SETTINGS_OPTIONS[k] as readonly number[]).includes(s[k]),
  );

/** Rules-engine config for the given settings. */
export const settingsToConfig = (s: GameSettings): Partial<BugshopConfig> => ({
  msPerCoin: s.secondsPerCoin * 1000,
  squishPrice: s.squishPrice,
});

/** Options for `create`. `joinById` and `reconnect` send none. */
export interface CreateOptions extends GameSettings {
  mode: GameMode;
}

export type JoinOptions = CreateOptions | Record<string, never>;

/** What everyone may know about a player: their chosen name and Elo rating. */
export interface PlayerInfo {
  name: string;
  rating: number;
}

/** A player's rating before and after one rated game. */
export interface RatingChange {
  before: number;
  after: number;
}

/** One open public lobby, as shown in the lobby list. */
export interface LobbyListing {
  roomId: string;
  settings: GameSettings;
  /** Who opened it. */
  host: PlayerInfo;
  /** When the lobby was opened (ms since epoch). */
  createdAt: number;
}

/** Seat state shown to both players. `away` = disconnected but may still reconnect. */
export type SeatStatus = 'empty' | 'connected' | 'away';

/** Message types. Client → server messages are requests (they get a reply). */
export const Msg = {
  /** C→S request: perform a game action. Replies `true`, or rejects with an {@link ActionRejection}. */
  action: 'action',
  /** C→S request: read the server clock (for clock-offset estimation). Replies {@link TimeReply}. */
  time: 'time',
  /** S→C: which color this connection plays. */
  welcome: 'welcome',
  /** S→C: full room snapshot after every change (opponent's pocket hidden until the game ends). */
  snapshot: 'snapshot',
  /** S→C (lobby list room): every open public lobby, sent on join and after each change. */
  lobbies: 'lobbies',
  /** S→C (lobby list room): {@link OnlineCount}, sent on join and whenever it changes. */
  online: 'online',
} as const;

/** How many people are connected to the game server right now. Counts only, never who. */
export interface OnlineCount {
  /**
   * People connected: on the home page or in an online game that isn't over
   * (bot and pass-and-play games run offline). A signed-in person counts once,
   * however many tabs they have open; a visitor who isn't signed in, once per tab.
   */
  online: number;
  /** Of those, how many are seated in a game under way. */
  playing: number;
}

export interface Welcome {
  color: Color;
}

export interface Snapshot {
  mode: GameMode;
  settings: GameSettings;
  /** `null` until both players have joined. */
  game: GameState | null;
  seats: ByColor<SeatStatus>;
  /** Who sits where (`null` while a seat is empty). Ratings are as of joining. */
  players: ByColor<PlayerInfo | null>;
  /**
   * Set once a rated game has ended. A finished game without it was not rated
   * (it ended before both players had moved).
   */
  ratings: ByColor<RatingChange> | null;
  /**
   * Whose first move is due and by when (server ms), as on lichess: miss it and
   * the game is aborted (unrated). `null` once both players have moved.
   */
  firstMove: { color: Color; deadline: number } | null;
  /** Server time when the snapshot was sent (ms since epoch). */
  serverNow: number;
}

export interface TimeReply {
  serverNow: number;
}

/** Why the server refused an action. */
export type ActionRejection = RuleError | 'not-started' | 'not-a-player';

/** Server-side limits that clients may want to know about. */
export const Limits = {
  /** Seconds a dropped player has to reconnect before their seat is given up. */
  reconnectSeconds: 600,
  /** Seconds each player has for their first move before the game is aborted. */
  firstMoveSeconds: 20,
} as const;

// ---------- accounts (HTTP API on the game server) ----------

/** HTTP paths on the game server. Everything under `auth` is Better Auth's API. */
export const ApiPath = {
  auth: '/api/auth',
  /** GET: the signed-in account ({@link AccountInfo}), or 401. */
  me: '/api/me',
  /** POST {@link ProfileRequest}: choose the player name (once). */
  profile: '/api/profile',
  /** GET: which sign-in methods are switched on ({@link AuthProviders}). */
  providers: '/api/providers',
  /** GET: the top players by rating ({@link Leaderboard}). Public, no session needed. */
  leaderboard: '/api/leaderboard',
  /** GET: the site-wide banner message ({@link AnnouncementReply}). Public, no session needed. */
  announcement: '/api/announcement',
} as const;

/** Longest banner message, in characters. */
export const ANNOUNCEMENT_MAX_LENGTH = 280;

/** A site-wide message for players (maintenance, news). Plain text only. */
export interface Announcement {
  message: string;
  level: 'info' | 'warning';
  /** When it was set (ms since epoch); identifies the message, e.g. to remember a dismissal. */
  updatedAt: number;
}

export interface AnnouncementReply {
  announcement: Announcement | null;
}

/** One row of the leaderboard: only what any player may already see (name, rating), plus games played. */
export interface LeaderboardEntry extends PlayerInfo {
  /** 1-based; players with the same rating share a rank. */
  rank: number;
  games: number;
}

export interface Leaderboard {
  players: LeaderboardEntry[];
}

/** The leaderboard lists this many players, among those with at least `minGames` rated games. */
export const LEADERBOARD = { size: 50, minGames: 1 } as const;

/** Player names: 3-16 letters, digits, `_` or `-`, starting with a letter. Unique ignoring case. */
export const HANDLE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,15}$/;

/** Shortest password the server accepts. */
export const MIN_PASSWORD_LENGTH = 10;

export interface PlayerRecord extends PlayerInfo {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface AccountInfo {
  email: string;
  /** `null` until the account has chosen a player name; it can't play before that. */
  player: PlayerRecord | null;
}

export interface ProfileRequest {
  handle: string;
}

export type ProfileError = 'invalid' | 'taken' | 'already-set';

export interface AuthProviders {
  google: boolean;
  apple: boolean;
  /** Whether new email accounts must confirm their address before signing in. */
  emailVerification: boolean;
}
