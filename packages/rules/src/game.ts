import { opposite, parseUci, makeUci, makeSquare, type ByColor, type Color, type SquareName } from 'chessops';
import { chessgroundDests } from 'chessops/compat';
import { makeSanAndPlay } from 'chessops/san';
import { type BugshopConfig, type ShopRole, SHOP_ROLES, makeConfig } from './config.ts';
import { type ClockState, elapsedAt, startClock, stopClock, switchTurn } from './clock.ts';
import { type BugshopPosition, INITIAL_FEN, positionFromFen, positionToFen } from './position.ts';

export type GameStatus = 'playing' | 'checkmate' | 'stalemate' | 'resign' | 'claimVictory' | 'drawAgreed';

export type GameEvent =
  | { type: 'move'; by: Color; uci: string; san: string; at: number }
  | { type: 'buy'; by: Color; role: ShopRole; price: number; at: number }
  | { type: 'claimVictory'; by: Color; price: number; at: number }
  | { type: 'resign'; by: Color; at: number }
  | { type: 'offerDraw'; by: Color; at: number }
  | { type: 'acceptDraw'; by: Color; at: number }
  | { type: 'declineDraw'; by: Color; at: number };

/** Plain, JSON-serializable game state, safe to send over the network or store. */
export interface GameState {
  config: BugshopConfig;
  /** Crazyhouse-style FEN; the `[...]` part holds both pockets. */
  fen: string;
  /** Coins each side has spent in the shop. */
  spent: ByColor<number>;
  clock: ClockState;
  status: GameStatus;
  winner?: Color;
  /** Color with a pending draw offer, if any. */
  drawOffer?: Color;
  history: GameEvent[];
}

export type Action =
  | { type: 'move'; uci: string }
  | { type: 'buy'; role: ShopRole }
  | { type: 'claimVictory' }
  | { type: 'resign' }
  | { type: 'offerDraw' }
  | { type: 'acceptDraw' }
  | { type: 'declineDraw' };

export type RuleError =
  | 'game-over'
  | 'not-your-turn'
  | 'invalid-uci'
  | 'illegal-move'
  | 'unknown-role'
  | 'not-enough-coins'
  | 'pocket-full'
  | 'draw-already-offered'
  | 'no-draw-offer';

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: RuleError };

export interface CreateGameOptions {
  now: number;
  config?: Partial<BugshopConfig>;
  /** Custom start position (Crazyhouse FEN). Defaults to the standard setup with empty pockets. */
  fen?: string;
}

/** chessops refuses positions where pieces on board + in pockets exceed 64. */
const MAX_MATERIAL = 64;

export const createGame = ({ now, config, fen = INITIAL_FEN }: CreateGameOptions): GameState => {
  const pos = positionFromFen(fen); // validates
  return {
    config: makeConfig(config),
    fen: positionToFen(pos),
    spent: { white: 0, black: 0 },
    clock: startClock(now),
    status: 'playing',
    history: [],
  };
};

export const getPosition = (state: GameState): BugshopPosition => positionFromFen(state.fen);

export const turnOf = (state: GameState): Color => (state.fen.split(' ')[1] === 'b' ? 'black' : 'white');

/** Time used by each side as of `now`. */
export const elapsed = (state: GameState, now: number): ByColor<number> =>
  elapsedAt(state.clock, turnOf(state), now);

/** Coins earned so far by `color`: the opponent's elapsed time converted at `msPerCoin`. */
export const coinsEarned = (state: GameState, color: Color, now: number): number =>
  Math.floor(elapsed(state, now)[opposite(color)] / state.config.msPerCoin);

/** Coins `color` can spend right now. */
export const coinsAt = (state: GameState, color: Color, now: number): number =>
  coinsEarned(state, color, now) - state.spent[color];

/** Pocket contents of both sides. */
export const pockets = (state: GameState): ByColor<Record<ShopRole, number>> => {
  const p = getPosition(state).pockets!;
  const side = (c: Color) => ({ pawn: p[c].pawn, knight: p[c].knight, bishop: p[c].bishop, rook: p[c].rook, queen: p[c].queen });
  return { white: side('white'), black: side('black') };
};

/** Legal board moves for the side to move, in chessground's `dests` format. */
export const legalDests = (state: GameState): Map<SquareName, SquareName[]> =>
  state.status === 'playing' ? chessgroundDests(getPosition(state)) : new Map();

/**
 * Squares where the side to move could legally drop `role`, regardless of
 * whether it is currently in their pocket (useful for previews before buying).
 */
export const dropDests = (state: GameState, role: ShopRole): SquareName[] => {
  if (state.status !== 'playing') return [];
  const pos = getPosition(state);
  const side = pos.pockets![pos.turn];
  for (const r of SHOP_ROLES) side[r] = r === role ? 1 : 0;
  const result: SquareName[] = [];
  for (const sq of pos.dropDests()) {
    if (pos.isLegal({ role, to: sq })) result.push(makeSquare(sq));
  }
  return result;
};

const materialCount = (pos: BugshopPosition): number => pos.board.occupied.size() + pos.pockets!.size();

/**
 * Whether the side to move has any way to continue: a legal move or drop with
 * its current pocket, or a drop of a piece it can afford to buy right now.
 * Since buying is free of tempo, a player who can buy their way out of check
 * (or out of stalemate) is not mated (or stalemated).
 */
const hasAnyContinuation = (pos: BugshopPosition, coins: number, config: BugshopConfig): boolean => {
  if (pos.hasDests()) return true;
  if (materialCount(pos) >= MAX_MATERIAL) return false;
  const affordable = SHOP_ROLES.filter(r => config.prices[r] <= coins);
  if (affordable.length === 0) return false;
  const hypothetical = pos.clone();
  for (const r of affordable) hypothetical.pockets![hypothetical.turn][r]++;
  return hypothetical.hasDests();
};

const endGame = (state: GameState, now: number, status: GameStatus, winner?: Color): GameState => {
  const next: GameState = {
    ...state,
    status,
    clock: stopClock(state.clock, turnOf(state), now),
  };
  delete next.drawOffer;
  if (winner) next.winner = winner;
  return next;
};

const fail = (error: RuleError): ActionResult => ({ ok: false, error });

/**
 * Apply `action` performed by `by` at time `now` (ms). Pure: returns a new state
 * or an error, never mutates `state`.
 */
export const applyAction = (state: GameState, by: Color, action: Action, now: number): ActionResult => {
  if (state.status !== 'playing') return fail('game-over');

  switch (action.type) {
    case 'move': {
      const pos = getPosition(state);
      if (pos.turn !== by) return fail('not-your-turn');
      const move = parseUci(action.uci);
      if (!move) return fail('invalid-uci');
      if (!pos.isLegal(move)) return fail('illegal-move');

      const san = makeSanAndPlay(pos, move);
      let next: GameState = {
        ...state,
        fen: positionToFen(pos),
        clock: switchTurn(state.clock, by, now),
        history: [...state.history, { type: 'move', by, uci: makeUci(move), san, at: now }],
      };
      // Making a move implicitly declines a draw offered by the opponent.
      if (next.drawOffer === opposite(by)) delete next.drawOffer;

      const opponentCoins = coinsAt(next, pos.turn, now);
      if (!hasAnyContinuation(pos, opponentCoins, state.config)) {
        next = pos.isCheck() ? endGame(next, now, 'checkmate', by) : endGame(next, now, 'stalemate');
      }
      return { ok: true, state: next };
    }

    case 'buy': {
      if (!SHOP_ROLES.includes(action.role)) return fail('unknown-role');
      const price = state.config.prices[action.role];
      if (coinsAt(state, by, now) < price) return fail('not-enough-coins');
      const pos = getPosition(state);
      if (materialCount(pos) >= MAX_MATERIAL) return fail('pocket-full');
      pos.pockets![by][action.role]++;
      return {
        ok: true,
        state: {
          ...state,
          fen: positionToFen(pos),
          spent: { ...state.spent, [by]: state.spent[by] + price },
          history: [...state.history, { type: 'buy', by, role: action.role, price, at: now }],
        },
      };
    }

    case 'claimVictory': {
      const price = state.config.claimVictoryPrice;
      if (coinsAt(state, by, now) < price) return fail('not-enough-coins');
      const next = endGame(state, now, 'claimVictory', by);
      next.spent = { ...state.spent, [by]: state.spent[by] + price };
      next.history = [...state.history, { type: 'claimVictory', by, price, at: now }];
      return { ok: true, state: next };
    }

    case 'resign': {
      const next = endGame(state, now, 'resign', opposite(by));
      next.history = [...state.history, { type: 'resign', by, at: now }];
      return { ok: true, state: next };
    }

    case 'offerDraw': {
      if (state.drawOffer === by) return fail('draw-already-offered');
      // Offering while the opponent's offer is pending is simply an acceptance.
      if (state.drawOffer === opposite(by)) return applyAction(state, by, { type: 'acceptDraw' }, now);
      return {
        ok: true,
        state: { ...state, drawOffer: by, history: [...state.history, { type: 'offerDraw', by, at: now }] },
      };
    }

    case 'acceptDraw': {
      if (state.drawOffer !== opposite(by)) return fail('no-draw-offer');
      const next = endGame(state, now, 'drawAgreed');
      next.history = [...state.history, { type: 'acceptDraw', by, at: now }];
      return { ok: true, state: next };
    }

    case 'declineDraw': {
      if (state.drawOffer !== opposite(by)) return fail('no-draw-offer');
      const next: GameState = { ...state, history: [...state.history, { type: 'declineDraw', by, at: now }] };
      delete next.drawOffer;
      return { ok: true, state: next };
    }
  }
};

