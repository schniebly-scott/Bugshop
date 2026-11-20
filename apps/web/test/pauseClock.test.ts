import { describe, expect, it } from 'vitest';
import { applyAction, coinsAt, createGame, elapsedAt } from '@bugshop/rules';
import { RUNNING, gameTime, isPaused, pauseAt, resumeAt } from '../src/game/pauseClock';

const T0 = 1_800_000_000_000;
const MIN = 60_000;

describe('pauseClock', () => {
  it('runs with real time until paused', () => {
    expect(gameTime(RUNNING, T0 + 5000)).toBe(T0 + 5000);
  });

  it('stands still while paused and skips the paused time afterwards', () => {
    const p = pauseAt(RUNNING, T0 + 10_000);
    expect(isPaused(p)).toBe(true);
    expect(gameTime(p, T0 + 10_000)).toBe(T0 + 10_000);
    expect(gameTime(p, T0 + 10 * MIN)).toBe(T0 + 10_000); // frozen
    const r = resumeAt(p, T0 + 10 * MIN);
    expect(isPaused(r)).toBe(false);
    expect(gameTime(r, T0 + 10 * MIN + 3000)).toBe(T0 + 13_000);
  });

  it('adds up several pauses, and ignores double pause or resume', () => {
    let c = pauseAt(RUNNING, T0 + 1000);
    c = pauseAt(c, T0 + 5000); // already paused: the first pause start stands
    c = resumeAt(c, T0 + 2000);
    c = resumeAt(c, T0 + 9000); // not paused: no change
    c = pauseAt(c, T0 + 4000);
    c = resumeAt(c, T0 + 7000);
    expect(c.total).toBe(1000 + 3000);
    expect(gameTime(c, T0 + 10_000)).toBe(T0 + 6000);
  });
});

describe('a paused local game', () => {
  const move = (game: ReturnType<typeof createGame>, by: 'white' | 'black', uci: string, now: number) => {
    const res = applyAction(game, by, { type: 'move', uci }, now);
    if (!res.ok) throw new Error(res.error);
    return res.state;
  };
  /** 1.e4 e5 played at once: white's clock is running from T0. */
  const opened = () => move(move(createGame({ now: T0 }), 'white', 'e2e4', T0), 'black', 'e7e5', T0);

  it('gives no one clock time or seeds for the pause', () => {
    // White thinks for 2 minutes of play over move two, with a 30-minute pause in the middle.
    const game = opened();
    let clock = pauseAt(RUNNING, T0 + MIN);
    expect(elapsedAt(game.clock, 'white', gameTime(clock, T0 + 31 * MIN)).white).toBe(MIN); // frozen during the pause
    clock = resumeAt(clock, T0 + 31 * MIN);
    const now = gameTime(clock, T0 + 32 * MIN);
    const paused = move(game, 'white', 'd2d4', now);

    // The same game without any pause: white plays d4 after 2 minutes.
    const unpaused = move(opened(), 'white', 'd2d4', T0 + 2 * MIN);

    expect(elapsedAt(paused.clock, 'black', now).white).toBe(2 * MIN);
    expect(coinsAt(paused, 'black', now)).toBe(coinsAt(unpaused, 'black', T0 + 2 * MIN));
    expect(coinsAt(paused, 'black', now)).toBeGreaterThan(0);
  });
});
