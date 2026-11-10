import type { ByColor, Color } from 'chessops';

/**
 * Count-up clock. `elapsed` holds each side's banked time; the side to move
 * additionally accrues `now - turnStartedAt` while the game is running.
 */
export interface ClockState {
  elapsed: ByColor<number>;
  /** When the current turn began; `null` once the clock is stopped (game over). */
  turnStartedAt: number | null;
}

export const startClock = (now: number): ClockState => ({
  elapsed: { white: 0, black: 0 },
  turnStartedAt: now,
});

/** Total time used by each side as of `now`. */
export const elapsedAt = (clock: ClockState, turn: Color, now: number): ByColor<number> => {
  const running = clock.turnStartedAt === null ? 0 : Math.max(0, now - clock.turnStartedAt);
  return {
    white: clock.elapsed.white + (turn === 'white' ? running : 0),
    black: clock.elapsed.black + (turn === 'black' ? running : 0),
  };
};

/** Bank the running time for `turn` and start the next turn at `now`. */
export const switchTurn = (clock: ClockState, turn: Color, now: number): ClockState => ({
  elapsed: elapsedAt(clock, turn, now),
  turnStartedAt: now,
});

/** Bank the running time and stop the clock. */
export const stopClock = (clock: ClockState, turn: Color, now: number): ClockState => ({
  elapsed: elapsedAt(clock, turn, now),
  turnStartedAt: null,
});
