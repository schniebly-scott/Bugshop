import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type GameState } from '@bugshop/rules';
import { boardFen, formatClock, lastMoveSquares, resultText } from '../src/game/view';

const ok = (r: ReturnType<typeof applyAction>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('view helpers', () => {
  it('boardFen strips pockets and the rest of the FEN', () => {
    expect(boardFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Nq] w KQkq - 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
    );
  });

  it('formatClock counts up in m:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_400)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('lastMoveSquares handles moves, drops, and skips purchases', () => {
    let g = createGame({ now: 0 });
    expect(lastMoveSquares(g)).toBeUndefined();
    g = ok(applyAction(g, 'white', { type: 'move', uci: 'e2e4' }, 60_000));
    g = ok(applyAction(g, 'black', { type: 'buy', role: 'pawn' }, 60_000));
    expect(lastMoveSquares(g)).toEqual(['e2', 'e4']);
    g = ok(applyAction(g, 'black', { type: 'move', uci: 'P@e5' }, 60_000));
    expect(lastMoveSquares(g)).toEqual(['e5']);
  });

  it('resultText describes the outcome', () => {
    const g = ok(applyAction(createGame({ now: 0 }), 'black', { type: 'resign' }, 0));
    expect(resultText(g)).toBe('Black resigned. White wins.');
    expect(resultText(createGame({ now: 0 }))).toBeUndefined();
  });
});
