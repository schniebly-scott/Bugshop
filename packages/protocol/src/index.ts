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

export const DEFAULT_SETTINGS: GameSettings = { secondsPerCoin: 60, squishPrice: 30 };

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

/** One open public lobby, as shown in the lobby list. */
export interface LobbyListing {
  roomId: string;
  settings: GameSettings;
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
} as const;

export interface Welcome {
  color: Color;
}

export interface Snapshot {
  mode: GameMode;
  settings: GameSettings;
  /** `null` until both players have joined. */
  game: GameState | null;
  seats: ByColor<SeatStatus>;
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
} as const;
