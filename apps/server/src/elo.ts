// Elo ratings. Pure functions: no I/O, no clock.

export const INITIAL_RATING = 1200;
/** Ratings never drop below this, so a long losing streak can't go negative. */
export const MIN_RATING = 100;
/** A player's first games move their rating faster, so it settles quickly. */
export const PROVISIONAL_GAMES = 20;
const K_PROVISIONAL = 40;
const K_ESTABLISHED = 24;

/** Result from White's point of view: 1 win, 0.5 draw, 0 loss. */
export type Score = 0 | 0.5 | 1;

export interface Rated {
  rating: number;
  /** Rated games finished before this one. */
  games: number;
}

/** Probability that a player rated `a` beats one rated `b` (a draw counts half). */
export const expectedScore = (a: number, b: number): number => 1 / (1 + 10 ** ((b - a) / 400));

const kFactor = (games: number): number => (games < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED);

const next = (me: Rated, opponent: Rated, score: number): number =>
  Math.max(MIN_RATING, Math.round(me.rating + kFactor(me.games) * (score - expectedScore(me.rating, opponent.rating))));

/** New ratings for both players after one game. */
export const rateGame = (white: Rated, black: Rated, whiteScore: Score): { white: number; black: number } => ({
  white: next(white, black, whiteScore),
  black: next(black, white, 1 - whiteScore),
});
