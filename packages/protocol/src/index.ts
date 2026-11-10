import type { ByColor, Color } from 'chessops';
import type { GameState, RuleError } from '@bugshop/rules';

/** Colyseus room name for Bugshop games. */
export const ROOM_NAME = 'bugshop';

/**
 * `public`: found through matchmaking (`joinOrCreate`).
 * `private`: hidden from matchmaking; joined only through its invite link (`joinById`).
 */
export type GameMode = 'public' | 'private';

/** Options for `create` / `joinOrCreate`. `joinById` and `reconnect` send none. */
export interface JoinOptions {
  mode?: GameMode;
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
  /** S→C: full room snapshot after every change. */
  snapshot: 'snapshot',
} as const;

export interface Welcome {
  color: Color;
}

export interface Snapshot {
  mode: GameMode;
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
