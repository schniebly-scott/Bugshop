/**
 * A game clock that can be paused. Clocks and seeds in the rules engine are pure
 * functions of the time they are given, so a local game that runs on this clock
 * (real time minus the time spent paused) stands still while paused: no clock
 * runs and no seeds accrue.
 */
export interface PauseClock {
  /** Real time when the current pause began, or null while running. */
  since: number | null;
  /** Real time spent paused in earlier pauses. */
  total: number;
}

export const RUNNING: PauseClock = { since: null, total: 0 };

export const isPaused = (c: PauseClock): boolean => c.since !== null;

/** The game's time at real time `real`: frozen while paused. */
export const gameTime = (c: PauseClock, real: number): number => (c.since ?? real) - c.total;

export const pauseAt = (c: PauseClock, real: number): PauseClock => (c.since !== null ? c : { ...c, since: real });

export const resumeAt = (c: PauseClock, real: number): PauseClock =>
  c.since === null ? c : { since: null, total: c.total + Math.max(0, real - c.since) };
