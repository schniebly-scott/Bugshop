import { describe, expect, it } from 'vitest';
import type { Color } from 'chessops';
import { type GameState, DEFAULT_CONFIG, applyAction, coinsAt, createGame, turnOf } from '@bugshop/rules';
import { type BotInput, acceptsDraw, chooseMove } from '../src/bot/engine';
import { type BotLevel, BOT_LEVELS } from '../src/bot/levels';

/** Deterministic random numbers, so a failing game can be replayed. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ask = (fen: string, level: BotLevel = 'hornet', extra: Partial<BotInput> = {}) =>
  chooseMove({ fen, coins: 0, prices: DEFAULT_CONFIG.prices, level, timeMs: 400, ...extra }, seeded(1));

describe('bot tactics', () => {
  it('delivers mate in one', () => {
    // Back-rank mate: Ra8#.
    expect(ask('6k1/5ppp/8/8/8/8/8/R5K1[] w - - 0 1')?.uci).toBe('a1a8');
  });

  it('takes a hanging queen', () => {
    const move = ask('4k3/8/8/3q4/8/8/8/3RK3[] w - - 0 1', 'mantis');
    expect(move?.uci).toBe('d1d5');
  });

  it('does not hang its own queen to a pawn', () => {
    // Qd4 would be taken by the c5 or e5 pawn.
    for (const level of ['mantis', 'hornet'] as const) {
      const move = ask('4k3/8/8/2p1p3/8/8/3Q4/4K3[] w - - 0 1', level);
      expect(move?.uci).not.toBe('d2d4');
    }
  });

  it('mates with a piece from its pocket', () => {
    // A rook in hand: R@a8 is mate.
    const move = ask('6k1/5ppp/8/8/8/8/8/6K1[R] w - - 0 1');
    expect(move).toMatchObject({ uci: 'R@a8' });
    expect(move?.buy).toBeUndefined();
  });

  it('buys a piece when the drop wins, and only if it can pay', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/6K1[] w - - 0 1';
    expect(ask(fen, 'hornet', { coins: 5 })).toMatchObject({ buy: 'rook', uci: 'R@a8' });
    const poor = ask(fen, 'hornet', { coins: 4 });
    expect(poor?.buy === 'rook' || poor?.uci.startsWith('Q@')).toBe(false);
  });

  it('buys its way out of a check that has no other answer', () => {
    // White is in check on the back rank from the a1 rook; the king is boxed in by its own pawns.
    const fen = '6k1/8/8/8/8/8/5PPP/r5K1[] w - - 0 1';
    expect(ask(fen, 'hornet', { coins: 0 })).toBeUndefined();
    const move = ask(fen, 'hornet', { coins: 1 });
    // A pawn can't be dropped on the first rank, so one seed is not enough...
    expect(move).toBeUndefined();
    // ...but three buy a knight or bishop to block.
    const blocked = ask(fen, 'larva', { coins: 3 });
    expect(blocked?.buy).toMatch(/knight|bishop/);
    expect(blocked?.uci).toMatch(/^[NB]@[b-f]1$/);
  });

  it("ignores the opponent's pocket (it is hidden information)", () => {
    const base = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R';
    const a = ask(`${base}[] w KQkq - 2 3`, 'mantis');
    const b = ask(`${base}[qrrnn] w KQkq - 2 3`, 'mantis');
    expect(b).toEqual(a);
  });

  it('takes a draw only when it is clearly worse', () => {
    expect(acceptsDraw('4k3/8/8/8/8/8/8/Q3K3[] w - - 0 1', 'white')).toBe(false);
    expect(acceptsDraw('4k3/8/8/8/8/8/8/Q3K3[] w - - 0 1', 'black')).toBe(true);
    expect(acceptsDraw('4k3/8/8/8/8/8/8/Q3K3[] b - - 0 1', 'black')).toBe(true);
  });
});

/** Play a whole game between two bots through the real rules engine. */
const playGame = (white: BotLevel, black: BotLevel, seed: number, maxPlies = 160) => {
  const random = seeded(seed);
  let now = 0;
  let state: GameState = createGame({ now, config: { msPerCoin: 10_000 } });
  const level = (c: Color) => (c === 'white' ? white : black);
  let plies = 0;
  while (state.status === 'playing' && plies < maxPlies) {
    const turn = turnOf(state);
    now += 4000 + Math.floor(random() * 8000); // "thinking" time, which earns the opponent seeds
    const move = chooseMove(
      { fen: state.fen, coins: coinsAt(state, turn, now), prices: state.config.prices, level: level(turn), positions: state.positions, timeMs: 60 },
      random,
    );
    if (!move) throw new Error(`no move in a live position: ${state.fen}`);
    if (move.buy) {
      const bought = applyAction(state, turn, { type: 'buy', role: move.buy }, now);
      if (!bought.ok) throw new Error(`illegal purchase ${move.buy} (${bought.error}) in ${state.fen}`);
      state = bought.state;
    }
    const moved = applyAction(state, turn, { type: 'move', uci: move.uci }, now);
    if (!moved.ok) throw new Error(`illegal move ${move.uci} (${moved.error}) in ${state.fen}`);
    state = moved.state;
    plies++;
  }
  return state;
};

describe('bot games', () => {
  it('every level only ever plays legal moves and purchases', () => {
    let bought = 0;
    BOT_LEVELS.forEach((level, i) => {
      const end = playGame(level, BOT_LEVELS[(i + 1) % BOT_LEVELS.length]!, 100 + i, 120);
      bought += end.history.filter(e => e.type === 'buy').length;
    });
    // The shop gets used: across four games somebody must have bought something.
    expect(bought).toBeGreaterThan(0);
  });

  it('stronger levels beat weaker ones', () => {
    let points = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const strongIsWhite = seed % 2 === 1;
      const end = playGame(strongIsWhite ? 'hornet' : 'larva', strongIsWhite ? 'larva' : 'hornet', seed, 240);
      const strong: Color = strongIsWhite ? 'white' : 'black';
      points += end.winner === strong ? 1 : end.winner ? 0 : 0.5;
    }
    expect(points).toBeGreaterThanOrEqual(3);
  });
});
