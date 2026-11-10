import type { ByColor, Color } from 'chessops';
import type { BugshopConfig, GameState, RuleError } from '@bugshop/rules';

/** Colyseus room name for Bugshop games. */
export const ROOM_NAME = 'bugshop';

/**
 * `public`: found through matchmaking (`joinOrCreate`).
 * `private`: hidden from matchmaking; joined only through its invite link (`joinById`).
 */
export type GameMode = 'public' | 'private';

/**
 * Per-game settings chosen by whoever creates the game. Public matchmaking only
 * pairs players who asked for identical settings, which is the basis for
 * future lobbies per setting.
 */
export interface GameSettings {
  /** Seconds of opponent thinking time that earn one coin. */
  secondsPerCoin: number;
  /** Coins needed to buy Claim Victory. */
  claimVictoryPrice: number;
}

export const DEFAULT_SETTINGS: GameSettings = { secondsPerCoin: 60, claimVictoryPrice: 30 };

/** Inclusive bounds (whole numbers). The server enforces these; the UI mirrors them. */
export const SETTINGS_LIMITS = {
  secondsPerCoin: { min: 5, max: 600 },
  claimVictoryPrice: { min: 1, max: 500 },
} as const satisfies Record<keyof GameSettings, { min: number; max: number }>;

export const isValidSettings = (s: GameSettings): boolean =>
  (Object.keys(SETTINGS_LIMITS) as (keyof GameSettings)[]).every(k => {
    const v = s[k];
    return Number.isInteger(v) && v >= SETTINGS_LIMITS[k].min && v <= SETTINGS_LIMITS[k].max;
  });

/** Rules-engine config for the given settings. */
export const settingsToConfig = (s: GameSettings): Partial<BugshopConfig> => ({
  msPerCoin: s.secondsPerCoin * 1000,
  claimVictoryPrice: s.claimVictoryPrice,
});

/**
 * Options for `create` / `joinOrCreate`. All fields are required: matchmaking
 * filters on them, and a missing field would match rooms with any value.
 */
export interface CreateOptions extends GameSettings {
  mode: GameMode;
}

/** `joinById` and `reconnect` send no options. */
export type JoinOptions = CreateOptions | Record<string, never>;

/** Fields public matchmaking must match exactly. */
export const MATCH_FIELDS = ['mode', 'secondsPerCoin', 'claimVictoryPrice'] as const satisfies (keyof CreateOptions)[];

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
  /** S→C: full room snapshot after every change. */
  snapshot: 'snapshot',
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
