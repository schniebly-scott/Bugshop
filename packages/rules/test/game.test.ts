import { describe, expect, it } from 'vitest';
import {
  type Action,
  type GameState,
  applyAction,
  coinsAt,
  createGame,
  dropDests,
  elapsed,
  pockets,
  turnOf,
} from '../src/index.js';
import type { Color } from 'chessops';

const MIN = 60_000;

/** Apply an action and assert it succeeded. */
const act = (state: GameState, by: Color, action: Action, now: number): GameState => {
  const res = applyAction(state, by, action, now);
  if (!res.ok) throw new Error(`${by} ${JSON.stringify(action)} failed: ${res.error}`);
  return res.state;
};
const mv = (state: GameState, by: Color, uci: string, now: number) => act(state, by, { type: 'move', uci }, now);
const errorOf = (state: GameState, by: Color, action: Action, now: number) => {
  const res = applyAction(state, by, action, now);
  return res.ok ? undefined : res.error;
};

describe('setup', () => {
  it('starts with white to move, empty pockets, no coins', () => {
    const g = createGame({ now: 0 });
    expect(turnOf(g)).toBe('white');
    expect(pockets(g).white).toEqual({ pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 });
    expect(coinsAt(g, 'white', 0)).toBe(0);
    expect(g.config.prices).toEqual({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 });
  });

  it('allows config overrides', () => {
    const g = createGame({ now: 0, config: { msPerCoin: 30_000, prices: { queen: 12 } as never } });
    expect(g.config.msPerCoin).toBe(30_000);
    expect(g.config.prices.queen).toBe(12);
    expect(g.config.prices.pawn).toBe(1);
  });
});

describe('count-up clock and coins', () => {
  it('counts the side to move up and converts opponent time into coins', () => {
    const g = createGame({ now: 0 });
    expect(elapsed(g, 3.5 * MIN)).toEqual({ white: 3.5 * MIN, black: 0 });
    expect(coinsAt(g, 'black', 3.5 * MIN)).toBe(3); // floor
    expect(coinsAt(g, 'white', 3.5 * MIN)).toBe(0);
  });

  it('banks time on each move', () => {
    let g = createGame({ now: 0 });
    g = mv(g, 'white', 'e2e4', 2 * MIN);
    g = mv(g, 'black', 'e7e5', 7 * MIN);
    expect(elapsed(g, 7 * MIN)).toEqual({ white: 2 * MIN, black: 5 * MIN });
    expect(coinsAt(g, 'white', 7 * MIN)).toBe(5);
    expect(coinsAt(g, 'black', 7 * MIN)).toBe(2);
  });
});

describe('shop', () => {
  it('lets a player buy on the opponent turn without using a turn or touching the clock', () => {
    let g = createGame({ now: 0 });
    g = act(g, 'black', { type: 'buy', role: 'knight' }, 4 * MIN); // white is thinking
    expect(turnOf(g)).toBe('white');
    expect(pockets(g).black.knight).toBe(1);
    expect(g.spent.black).toBe(3);
    expect(coinsAt(g, 'black', 4 * MIN)).toBe(1);
    expect(g.clock).toEqual(createGame({ now: 0 }).clock);
  });

  it('rejects purchases the player cannot afford', () => {
    const g = createGame({ now: 0 });
    expect(errorOf(g, 'black', { type: 'buy', role: 'queen' }, 8 * MIN)).toBe('not-enough-coins');
    expect(errorOf(g, 'black', { type: 'buy', role: 'king' as never }, 99 * MIN)).toBe('unknown-role');
  });

  it('dropping a bought piece uses the turn', () => {
    let g = createGame({ now: 0 });
    g = mv(g, 'white', 'e2e4', 3 * MIN);
    g = act(g, 'black', { type: 'buy', role: 'knight' }, 3 * MIN);
    g = mv(g, 'black', 'N@e5', 4 * MIN);
    expect(turnOf(g)).toBe('white');
    expect(pockets(g).black.knight).toBe(0);
    expect(g.history.at(-1)).toMatchObject({ type: 'move', san: 'N@e5' });
  });

  it('cannot drop a piece that has not been bought', () => {
    let g = createGame({ now: 0 });
    g = mv(g, 'white', 'e2e4', MIN);
    expect(errorOf(g, 'black', { type: 'move', uci: 'N@e5' }, MIN)).toBe('illegal-move');
  });

  it('forbids pawn drops on the 1st and 8th ranks (bughouse rule)', () => {
    let g = createGame({ now: 0, fen: '4k3/8/8/8/8/8/8/4K3[] b - - 0 1' });
    g = act(g, 'white', { type: 'buy', role: 'pawn' }, 2 * MIN);
    g = mv(g, 'black', 'e8d8', 2 * MIN);
    expect(errorOf(g, 'white', { type: 'move', uci: 'P@a1' }, 2 * MIN)).toBe('illegal-move');
    expect(errorOf(g, 'white', { type: 'move', uci: 'P@a8' }, 2 * MIN)).toBe('illegal-move');
    const dests = dropDests(g, 'pawn');
    expect(dests).toContain('a2');
    expect(dests.some(sq => sq.endsWith('1') || sq.endsWith('8'))).toBe(false);
    expect(dropDests(g, 'knight')).toContain('a8');
    g = mv(g, 'white', 'P@a7', 2 * MIN);
    expect(pockets(g).white.pawn).toBe(0);
  });
});

describe('captures', () => {
  it('captured pieces do not go to the capturer pocket', () => {
    let g = createGame({ now: 0 });
    g = mv(g, 'white', 'e2e4', 0);
    g = mv(g, 'black', 'd7d5', 0);
    g = mv(g, 'white', 'e4d5', 0);
    g = mv(g, 'black', 'd8d5', 0);
    expect(pockets(g).white).toEqual({ pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 });
    expect(pockets(g).black).toEqual({ pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 });
  });
});

describe('game end', () => {
  // Fool's mate: 1.f3 e5 2.g4 Qh4. The check could be blocked by a drop on g3 or f2.
  const foolsMate = (blackThinkMs: number) => {
    let g = createGame({ now: 0 });
    g = mv(g, 'white', 'f2f3', 0);
    g = mv(g, 'black', 'e7e5', blackThinkMs);
    g = mv(g, 'white', 'g2g4', blackThinkMs);
    return mv(g, 'black', 'd8h4', blackThinkMs);
  };

  it('checkmate when the mated side cannot afford to block', () => {
    const g = foolsMate(0);
    expect(g.status).toBe('checkmate');
    expect(g.winner).toBe('black');
    expect(g.clock.turnStartedAt).toBeNull();
    expect(errorOf(g, 'white', { type: 'resign' }, 1)).toBe('game-over');
  });

  it('not checkmate when the side in check can buy a piece and drop it to block', () => {
    let g = foolsMate(MIN); // black used 1 minute -> white has 1 coin
    expect(g.status).toBe('playing');
    g = act(g, 'white', { type: 'buy', role: 'pawn' }, MIN);
    g = mv(g, 'white', 'P@g3', MIN);
    expect(g.status).toBe('playing');
    expect(turnOf(g)).toBe('black');
  });

  // Black king h8, white king f6; white plays Qg1-g6 stalemating black.
  const stalemateFen = '7k/8/5K2/8/8/8/8/6Q1[] w - - 0 1';

  it('stalemate is a draw when the stalemated side has no coins', () => {
    let g = createGame({ now: 0, fen: stalemateFen });
    g = mv(g, 'white', 'g1g6', 30_000);
    expect(g.status).toBe('stalemate');
    expect(g.winner).toBeUndefined();
  });

  it('not stalemate when the stalemated side can buy and drop a piece', () => {
    let g = createGame({ now: 0, fen: stalemateFen });
    g = mv(g, 'white', 'g1g6', MIN);
    expect(g.status).toBe('playing');
  });

  it('Claim Victory needs enough coins and ends the game immediately', () => {
    const g = createGame({ now: 0 });
    expect(errorOf(g, 'black', { type: 'claimVictory' }, 29 * MIN)).toBe('not-enough-coins');
    const won = act(g, 'black', { type: 'claimVictory' }, 30 * MIN);
    expect(won.status).toBe('claimVictory');
    expect(won.winner).toBe('black');
    expect(won.spent.black).toBe(30);
    expect(elapsed(won, 99 * MIN).white).toBe(30 * MIN); // clock frozen
  });

  it('resignation can happen on either turn', () => {
    const g = act(createGame({ now: 0 }), 'black', { type: 'resign' }, 5);
    expect(g.status).toBe('resign');
    expect(g.winner).toBe('white');
  });
});

describe('draw offers', () => {
  it('offer and accept', () => {
    let g = act(createGame({ now: 0 }), 'white', { type: 'offerDraw' }, 0);
    expect(errorOf(g, 'white', { type: 'acceptDraw' }, 0)).toBe('no-draw-offer');
    expect(errorOf(g, 'white', { type: 'offerDraw' }, 0)).toBe('draw-already-offered');
    g = act(g, 'black', { type: 'acceptDraw' }, 0);
    expect(g.status).toBe('drawAgreed');
  });

  it('explicit decline, and implicit decline by moving', () => {
    let g = createGame({ now: 0 });
    g = act(g, 'black', { type: 'offerDraw' }, 0);
    g = act(g, 'white', { type: 'declineDraw' }, 0);
    expect(g.drawOffer).toBeUndefined();

    g = act(g, 'black', { type: 'offerDraw' }, 0);
    g = mv(g, 'white', 'e2e4', 0);
    expect(g.drawOffer).toBeUndefined();
  });

  it('mutual offers result in a draw', () => {
    let g = act(createGame({ now: 0 }), 'white', { type: 'offerDraw' }, 0);
    g = act(g, 'black', { type: 'offerDraw' }, 0);
    expect(g.status).toBe('drawAgreed');
  });
});

describe('validation', () => {
  it('rejects moves out of turn, illegal moves and junk input', () => {
    const g = createGame({ now: 0 });
    expect(errorOf(g, 'black', { type: 'move', uci: 'e7e5' }, 0)).toBe('not-your-turn');
    expect(errorOf(g, 'white', { type: 'move', uci: 'e2e5' }, 0)).toBe('illegal-move');
    expect(errorOf(g, 'white', { type: 'move', uci: 'hello' }, 0)).toBe('invalid-uci');
  });

  it('never mutates the input state', () => {
    const g = createGame({ now: 0 });
    const snapshot = JSON.stringify(g);
    mv(g, 'white', 'e2e4', MIN);
    act(g, 'black', { type: 'buy', role: 'pawn' }, MIN);
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it('state survives a JSON round trip (network/storage)', () => {
    let g = createGame({ now: 0 });
    g = mv(g, 'white', 'e2e4', MIN);
    const copy: GameState = JSON.parse(JSON.stringify(g));
    expect(mv(copy, 'black', 'e7e5', MIN).fen).toBe(mv(g, 'black', 'e7e5', MIN).fen);
  });
});

describe('scripted game with purchases', () => {
  it('plays out to checkmate by a dropped piece', () => {
    let t = 0;
    let g = createGame({ now: t });
    g = mv(g, 'white', 'e2e4', (t += 3 * MIN)); // black now has 3 coins
    g = act(g, 'black', { type: 'buy', role: 'knight' }, t);
    g = mv(g, 'black', 'e7e5', (t += 10 * MIN)); // white now has 10 coins
    g = act(g, 'white', { type: 'buy', role: 'queen' }, t);
    expect(coinsAt(g, 'white', t)).toBe(1);
    g = mv(g, 'white', 'f1c4', (t += 1000));
    g = mv(g, 'black', 'N@f6', (t += 1000)); // drop uses black's turn
    g = mv(g, 'white', 'd1h5', (t += 1000));
    g = mv(g, 'black', 'b8c6', (t += 1000));
    // Scholar's-mate finish. The queen checks from an adjacent square, so no drop
    // could block it even if black could afford one.
    g = mv(g, 'white', 'h5f7', (t += 1000));
    expect(g.status).toBe('checkmate');
    expect(g.winner).toBe('white');
    expect(g.history.filter(e => e.type === 'buy')).toHaveLength(2);
    expect(g.history.map(e => (e.type === 'move' ? e.san : e.type))).toEqual([
      'e4', 'buy', 'e5', 'buy', 'Bc4', 'N@f6', 'Qh5', 'Nc6', 'Qxf7#',
    ]);
  });
});
