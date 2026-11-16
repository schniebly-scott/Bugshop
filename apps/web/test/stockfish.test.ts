import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@bugshop/rules';
import { decide, parseBestMove, parseScore, plan, stockfishSupported } from '../src/bot/stockfish';

const input = (fen: string, coins: number) => ({ fen, coins, prices: DEFAULT_CONFIG.prices, level: 'tarantula' as const });

describe('stockfish glue', () => {
  it('reads scores from info lines', () => {
    expect(parseScore('info depth 12 seldepth 13 multipv 1 score cp 91 nodes 1 pv e2e4')).toBe(91);
    expect(parseScore('info depth 9 score cp -340 upperbound pv a2a3')).toBe(-340);
    expect(parseScore('info depth 5 score mate 2 pv R@a8')).toBe(99_998);
    expect(parseScore('info depth 5 score mate -3 pv g8h8')).toBe(-99_997);
    expect(parseScore('info depth 0 score mate 0')).toBe(-100_000);
    expect(parseScore('info string variant bugshop')).toBeUndefined();
  });

  it('accepts only well-formed moves from the engine', () => {
    expect(parseBestMove('bestmove e2e4 ponder b8c6')).toBe('e2e4');
    expect(parseBestMove('bestmove N@f6')).toBe('N@f6');
    expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q');
    for (const bad of ['bestmove (none)', 'bestmove 0000', 'bestmove K@e4', 'bestmove e2e4<script>', 'info pv e2e4']) {
      expect(parseBestMove(bad)).toBeUndefined();
    }
  });

  it("hides the opponent's pocket and plans one what-if search per affordable piece", () => {
    const p = plan(input('6k1/5ppp/8/8/8/8/8/6K1[Bqr] w - - 0 1', 5));
    expect(p.fen).toBe('6k1/5ppp/8/8/8/8/8/6K1[B] w - - 0 1');
    // Affordable with 5 seeds and not already in the pocket: pawn, knight, rook.
    expect(p.purchases.map(x => x.role)).toEqual(['pawn', 'knight', 'rook']);
    const pawn = p.purchases[0]!;
    expect(pawn.fen).toMatch(/\[(BP|PB)\]/);
    expect(pawn.drops.every(d => /^P@[a-h][2-7]$/.test(d))).toBe(true);
    expect(p.purchases[2]!.drops).toContain('R@a8');
    expect(plan(input('6k1/5ppp/8/8/8/8/8/6K1[] w - - 0 1', 0)).purchases).toEqual([]);
  });

  it('in check, only plans drops that block', () => {
    const p = plan(input('6k1/8/8/8/8/8/5PPP/r5K1[] w - - 0 1', 9));
    expect(p.purchases.map(x => x.role)).toEqual(['knight', 'bishop', 'rook', 'queen']);
    expect(p.purchases[0]!.drops.sort()).toEqual(['N@b1', 'N@c1', 'N@d1', 'N@e1', 'N@f1']);
  });

  it('buys only when the drop is worth more than the seeds', () => {
    const base = { move: 'e2e4', score: 30 };
    const knight = (score: number) => ({ role: 'knight' as const, price: 3, move: 'N@f6', score });
    // 3 seeds are worth 276: a drop scoring 300 nets 24, less than base + margin.
    expect(decide(base, [knight(300)])).toEqual({ uci: 'e2e4', score: 30 });
    expect(decide(base, [knight(400)])).toEqual({ uci: 'N@f6', buy: 'knight', score: 124 });
    // The better of two purchases wins.
    expect(decide(base, [knight(400), { role: 'rook', price: 5, move: 'R@a8', score: 99_999 }])?.buy).toBe('rook');
    // No ordinary move (in check): any drop will do. No move at all: nothing.
    expect(decide({ move: undefined, score: -100_000 }, [knight(-500)])).toMatchObject({ uci: 'N@f6', buy: 'knight' });
    expect(decide({ move: undefined, score: -100_000 }, [])).toBeUndefined();
  });

  it('reports unsupported outside a cross-origin-isolated browser', () => {
    expect(stockfishSupported()).toBe(false);
  });
});
