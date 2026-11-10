/**
 * The single source of game time on the server. Game clocks and coins are
 * computed from this, never from anything a client sends.
 *
 * `offsetMs` exists only so tests can fast-forward game time without waiting
 * real minutes; production code never changes it.
 */
let offsetMs = 0;

export const serverNow = (): number => Date.now() + offsetMs;

export const advanceServerClockForTests = (ms: number): void => {
  if (process.env.NODE_ENV !== 'test') throw new Error('advanceServerClockForTests is test-only');
  offsetMs += ms;
};
