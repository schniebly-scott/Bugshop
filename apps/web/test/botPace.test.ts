import { describe, expect, it } from 'vitest';
import { type GameState, applyAction, createGame } from '@bugshop/rules';
import { LEVELS } from '../src/bot/levels';
import { shouldSquish, thinkTime } from '../src/bot/pace';

const play = (state: GameState, by: 'white' | 'black', uci: string, now: number): GameState => {
  const r = applyAction(state, by, { type: 'move', uci }, now);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('bot pace', () => {
  it('has a fixed opening tempo before the human has moved', () => {
    const g = createGame({ now: 0 });
    expect(thinkTime(g, 'white', LEVELS.hornet, 0, 0.5)).toBe(2500);
  });

  /** The human (white) opens for free, the bot answers, then the human takes `humanMs` over move two. */
  const humanTook = (humanMs: number) => {
    let g = createGame({ now: 0 });
    g = play(g, 'white', 'e2e4', 0); // first move: no time, the clock starts here
    g = play(g, 'black', 'e7e5', 0);
    return play(g, 'white', 'd2d4', humanMs);
  };

  it("ignores the human's free first move: there is no pace to copy yet", () => {
    let g = createGame({ now: 0 });
    g = play(g, 'white', 'e2e4', 8000);
    expect(thinkTime(g, 'black', LEVELS.larva, 8000, 0.5)).toBe(2500);
  });

  it('follows the human: slower on easy levels, faster on hard ones, within limits', () => {
    const g = humanTook(8000); // the human took 8 s
    expect(thinkTime(g, 'black', LEVELS.larva, 8000, 0.5)).toBe(11_200);
    expect(thinkTime(g, 'black', LEVELS.hornet, 8000, 0.5)).toBe(4800);
    expect(thinkTime(g, 'black', LEVELS.larva, 8000, 0)).toBeLessThan(thinkTime(g, 'black', LEVELS.larva, 8000, 0.999));

    expect(thinkTime(humanTook(100), 'black', LEVELS.hornet, 100, 0.5)).toBe(1200);
    expect(thinkTime(humanTook(10 * 60_000), 'black', LEVELS.larva, 10 * 60_000, 0.5)).toBe(20_000);
  });

  it('squishes only a player who has wandered off, only when it can pay, and only on strong levels', () => {
    const config = { msPerCoin: 10_000, squishPrice: 10 };
    let g = createGame({ now: 0, config });
    g = play(g, 'white', 'e2e4', 5000); // the human's first move: free, the clock starts here
    g = play(g, 'black', 'e7e5', 8000); // the bot (black) has moved; the human is on move since t = 8 s
    const at = (ms: number) => 8000 + ms;
    // 80 s of waiting: the human has used 80 s = 8 seeds, not yet 10, and it is too soon anyway.
    expect(shouldSquish(g, 'black', LEVELS.hornet, at(80_000))).toBe(false);
    // 100 s: long enough to count as away, and 100 s of human time buys 10 seeds.
    expect(shouldSquish(g, 'black', LEVELS.hornet, at(100_000))).toBe(true);
    expect(shouldSquish(g, 'black', LEVELS.larva, at(100_000))).toBe(false);
    // Not on the bot's own turn.
    expect(shouldSquish(g, 'white', LEVELS.hornet, at(100_000))).toBe(false);
    // A pricier Squish is out of reach.
    let dear = createGame({ now: 0, config: { msPerCoin: 10_000, squishPrice: 30 } });
    dear = play(dear, 'white', 'e2e4', 5000);
    dear = play(dear, 'black', 'e7e5', 8000);
    expect(shouldSquish(dear, 'black', LEVELS.hornet, at(100_000))).toBe(false);
  });
});
