import { describe, expect, it } from 'vitest';
import { INITIAL_RATING, MIN_RATING, expectedScore, rateGame } from '../src/elo.ts';

const fresh = { rating: INITIAL_RATING, games: 0 };
const veteran = (rating: number) => ({ rating, games: 100 });

describe('elo', () => {
  it('expects an even game between equals and favours the stronger player', () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 3);
    expect(expectedScore(1500, 1900) + expectedScore(1900, 1500)).toBeCloseTo(1);
  });

  it('moves new players faster than established ones', () => {
    expect(rateGame(fresh, fresh, 1)).toEqual({ white: 1220, black: 1180 });
    expect(rateGame(veteran(1200), veteran(1200), 1)).toEqual({ white: 1212, black: 1188 });
  });

  it('leaves equal players unchanged after a draw and rewards the underdog for one', () => {
    expect(rateGame(veteran(1500), veteran(1500), 0.5)).toEqual({ white: 1500, black: 1500 });
    const r = rateGame(veteran(1300), veteran(1700), 0.5);
    expect(r.white).toBeGreaterThan(1300);
    expect(r.black).toBeLessThan(1700);
  });

  it('gives an upset more points than an expected win', () => {
    const upset = rateGame(veteran(1300), veteran(1700), 1).white - 1300;
    const expected = rateGame(veteran(1700), veteran(1300), 1).white - 1700;
    expect(upset).toBeGreaterThan(expected * 5);
  });

  it('never drops below the floor', () => {
    expect(rateGame({ rating: MIN_RATING, games: 0 }, fresh, 0).white).toBe(MIN_RATING);
  });
});
