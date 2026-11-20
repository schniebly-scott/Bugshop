import { type Color, opposite } from 'chessops';
import { type GameState, coinsAt, elapsed } from '@bugshop/rules';
import type { LevelSpec } from './levels';

// The bot's clock matters: its thinking time is the human's income. A bot that
// answered instantly would leave the human with no seeds at all. So it plays at
// about the human's own pace, a bit slower on easy levels (more seeds for you)
// and faster on hard ones.

const MIN_THINK_MS = 1200;
const MAX_THINK_MS = 20_000;
/** Before the human has made a timed move there is no pace to copy. */
const OPENING_THINK_MS = 2500;

/**
 * Moves `color` made while the clock was running. The clock starts with the
 * game's first move, so that move took no time and doesn't count toward a pace.
 */
const timedMovesBy = (state: GameState, color: Color) => {
  const moves = state.history.filter(e => e.type === 'move');
  const mine = moves.filter(e => e.by === color).length;
  return moves[0]?.by === color ? mine - 1 : mine;
};

/** How long the bot should take over its next move, in ms. `random` is in [0, 1). */
export const thinkTime = (state: GameState, bot: Color, spec: LevelSpec, now: number, random: number): number => {
  const human = opposite(bot);
  const moves = timedMovesBy(state, human);
  const base = moves === 0 ? OPENING_THINK_MS : (elapsed(state, now)[human] / moves) * spec.tempo;
  const jitter = 0.75 + random * 0.5;
  return Math.round(Math.min(MAX_THINK_MS, Math.max(MIN_THINK_MS, base * jitter)));
};

/** The human has been on this move for a long time, and much longer than usual: they have wandered off. */
const AWAY_MS = 90_000;

/**
 * Whether the bot should buy Squish now. Only against a player who has gone
 * away: Squish exists to end abandoned games, not to win live ones.
 */
export const shouldSquish = (state: GameState, bot: Color, spec: LevelSpec, now: number): boolean => {
  if (!spec.squishes || state.status !== 'playing' || state.clock.turnStartedAt === null) return false;
  const human = opposite(bot);
  if (state.fen.split(' ')[1] !== human[0]) return false;
  const waiting = now - state.clock.turnStartedAt;
  const moves = timedMovesBy(state, human);
  const usual = moves === 0 ? 0 : (elapsed(state, now)[human] - waiting) / moves;
  return waiting >= Math.max(AWAY_MS, usual * 4) && coinsAt(state, bot, now) >= state.config.squishPrice;
};
