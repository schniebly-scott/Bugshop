import { type Color, type Move, type Role, type Square, isDrop, makeUci, opposite } from 'chessops';
import { type BugshopPosition, type ShopRole, SHOP_ROLES, positionFromFen, positionKey } from '@bugshop/rules';
import { type BotLevel, LEVELS } from './levels';

// The bot's brain: a small alpha-beta search over the same position class the
// rules engine uses, so it can never disagree with the rules about what is
// legal. Pure and synchronous; the web app runs it in a Web Worker.
//
// It plays fair: it never looks at the human's pocket or purchases. The
// opponent's pocket is emptied before searching, exactly as an online opponent
// would see it.

export interface BotInput {
  /** Current position (crazyhouse FEN with pockets). */
  fen: string;
  /** Seeds the bot can spend right now. */
  coins: number;
  prices: Record<ShopRole, number>;
  level: BotLevel;
  /** Position keys since the last irreversible move, to steer away from repetition when ahead. */
  positions?: readonly string[];
  /** Overrides the level's thinking budget (tests use a small one). */
  timeMs?: number;
}

export interface BotMove {
  /** Piece to buy before moving (it is then dropped by `uci`). */
  buy?: ShopRole;
  uci: string;
  /** Search score from the bot's point of view, in centipawns. */
  score: number;
}

const VALUE: Record<Role, number> = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 0 };
const ROLES: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const MATE = 100_000;
/**
 * What an unspent seed is worth. A little under a pawn per seed, so turning
 * seeds into pieces on the board is mildly attractive, but a drop still has to
 * be a decent move to be chosen over saving up.
 */
const COIN_VALUE = 92;
const MAX_PLY = 24;
const MAX_QUIESCENCE = 6;
/** chessops refuses positions with more than 64 pieces on board and in pockets. */
const MAX_MATERIAL = 64;

// ---------- evaluation ----------

const centre = (sq: Square, color: Color) => {
  const file = sq & 7;
  const rank = color === 'white' ? sq >> 3 : 7 - (sq >> 3);
  const fc = 3.5 - Math.abs(file - 3.5); // 0 on the rim .. 3 in the middle
  const rc = 3.5 - Math.abs(rank - 3.5);
  return { rank, fc: Math.floor(fc), c: Math.floor(Math.min(fc, rc)) };
};

const squareBonus = (role: Role, sq: Square, color: Color, endgame: boolean): number => {
  const { rank, fc, c } = centre(sq, color);
  switch (role) {
    case 'pawn':
      return rank * 5 + (fc === 3 ? rank * 5 - (rank === 1 ? 14 : 0) : 0);
    case 'knight':
      return c * 14 - 20;
    case 'bishop':
      return c * 7 - (rank === 0 ? 12 : 4);
    case 'rook':
      return (rank === 6 ? 16 : 0) + (fc >= 2 ? 5 : 0);
    case 'queen':
      return c * 3;
    case 'king':
      return endgame ? c * 14 - 14 : rank === 0 ? (fc <= 1 ? 26 : 0) : -22 * Math.min(rank, 3);
  }
};

/** Piece-square tables, built once: TABLE[endgame][color][role][square]. */
const TABLE = [false, true].map(endgame =>
  (['white', 'black'] as const).map(color =>
    ROLES.map(role => Array.from({ length: 64 }, (_, sq) => VALUE[role] + squareBonus(role, sq, color, endgame))),
  ),
);

/** Static score from the side to move's point of view. */
export const evaluate = (pos: BugshopPosition): number => {
  const { board } = pos;
  const heavy = board.queen.size() * 2 + board.rook.size();
  const table = TABLE[heavy <= 2 ? 1 : 0]!;
  let score = 0;
  for (let ci = 0; ci < 2; ci++) {
    const color = ci === 0 ? 'white' : 'black';
    const own = board[color];
    let side = 0;
    for (let ri = 0; ri < ROLES.length; ri++) {
      const squares = board[ROLES[ri]!].intersect(own);
      const t = table[ci]![ri]!;
      for (const sq of squares) side += t[sq]!;
    }
    if (board.bishop.intersect(own).size() >= 2) side += 30;
    const pocket = pos.pockets?.[color];
    if (pocket) for (const role of SHOP_ROLES) side += pocket[role] * (VALUE[role] + 10);
    score += ci === 0 ? side : -side;
  }
  return pos.turn === 'white' ? score : -score;
};

// ---------- move generation ----------

const isBackRank = (sq: Square) => sq < 8 || sq >= 56;

const generate = (pos: BugshopPosition, capturesOnly: boolean): Move[] => {
  const moves: Move[] = [];
  const ctx = pos.ctx();
  const them = pos.board[opposite(pos.turn)];
  for (const from of pos.board[pos.turn]) {
    let dests = pos.dests(from, ctx);
    const pawn = pos.board.pawn.has(from);
    if (capturesOnly) dests = dests.intersect(them);
    for (const to of dests) {
      if (pawn && isBackRank(to)) {
        moves.push({ from, to, promotion: 'queen' });
        if (!capturesOnly) moves.push({ from, to, promotion: 'knight' });
      } else moves.push({ from, to });
    }
  }
  if (!capturesOnly && pos.pockets) {
    const pocket = pos.pockets[pos.turn];
    if (pocket.size() > 0) {
      const squares = pos.dropDests(ctx);
      for (const role of SHOP_ROLES) {
        if (pocket[role] === 0) continue;
        for (const to of squares) if (role !== 'pawn' || !isBackRank(to)) moves.push({ role, to });
      }
    }
  }
  return moves;
};

/** Likely-good moves first (captures of valuable pieces by cheap ones, promotions), so cutoffs come early. */
const orderMoves = (pos: BugshopPosition, moves: Move[]): Move[] => {
  const them = pos.board[opposite(pos.turn)];
  const key = (m: Move): number => {
    if (isDrop(m)) return 0;
    let k = m.promotion ? VALUE[m.promotion] : 0;
    if (them.has(m.to)) k += 10 * VALUE[pos.board.getRole(m.to) ?? 'pawn'] - VALUE[pos.board.getRole(m.from) ?? 'pawn'];
    return k;
  };
  return moves
    .map(m => ({ m, k: key(m) }))
    .sort((a, b) => b.k - a.k)
    .map(x => x.m);
};

// ---------- search ----------

class OutOfTime extends Error {}

interface Search {
  deadline: number;
  nodes: number;
  quiescence: boolean;
}

const tick = (s: Search) => {
  if ((++s.nodes & 511) === 0 && Date.now() > s.deadline) throw new OutOfTime();
};

const quiesce = (s: Search, pos: BugshopPosition, alpha: number, beta: number, depth: number): number => {
  tick(s);
  const stand = evaluate(pos);
  if (depth === 0 || stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const move of orderMoves(pos, generate(pos, true))) {
    const child = pos.clone();
    child.play(move);
    const score = -quiesce(s, child, -beta, -alpha, depth - 1);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
};

const negamax = (s: Search, pos: BugshopPosition, depth: number, alpha: number, beta: number, ply: number): number => {
  tick(s);
  const inCheck = pos.isCheck();
  // Look one move further when in check: drops make checks dangerous.
  if (inCheck && ply < MAX_PLY) depth++;
  if (depth <= 0) return s.quiescence ? quiesce(s, pos, alpha, beta, MAX_QUIESCENCE) : evaluate(pos);
  const moves = generate(pos, false);
  // Prefer the quicker mate, and the slower defeat.
  if (moves.length === 0) return inCheck ? -MATE + ply : 0;
  let best = -Infinity;
  for (const move of orderMoves(pos, moves)) {
    const child = pos.clone();
    child.play(move);
    const score = -negamax(s, child, depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
};

interface Candidate {
  move: Move;
  buy?: ShopRole;
  /** Position after the move (and the purchase). */
  after: BugshopPosition;
  /** Seeds this candidate spends, as centipawns. */
  cost: number;
  score: number;
}

const materialCount = (pos: BugshopPosition) => pos.board.occupied.size() + (pos.pockets?.size() ?? 0);

/** Everything the bot could do this turn: its moves and drops, plus buying one piece and dropping it. */
const candidates = (root: BugshopPosition, input: BotInput, shop: boolean): Candidate[] => {
  const list: Candidate[] = [];
  const add = (from: BugshopPosition, move: Move, buy?: ShopRole) => {
    const after = from.clone();
    after.play(move);
    list.push({ move, buy, after, cost: buy ? input.prices[buy] * COIN_VALUE : 0, score: 0 });
  };
  for (const move of orderMoves(root, generate(root, false))) add(root, move);

  // In check with no way out on the board, the shop may be the only escape, so always look.
  if ((shop || list.length === 0) && root.pockets && materialCount(root) < MAX_MATERIAL) {
    const ctx = root.ctx();
    for (const role of SHOP_ROLES) {
      if (input.prices[role] > input.coins || root.pockets[root.turn][role] > 0) continue;
      const bought = root.clone();
      bought.pockets![bought.turn][role]++;
      for (const to of bought.dropDests(ctx)) if (role !== 'pawn' || !isBackRank(to)) add(bought, { role, to }, role);
    }
  }
  return list;
};

/**
 * Choose the bot's move. Returns undefined only when the side to move has no
 * legal continuation at all (the game is then already over by the rules).
 */
export const chooseMove = (input: BotInput, random: () => number = Math.random): BotMove | undefined => {
  const spec = LEVELS[input.level];
  const root = positionFromFen(input.fen);
  // Fair play: the opponent's pocket is hidden information.
  const hidden = root.pockets?.[opposite(root.turn)];
  if (hidden) for (const role of SHOP_ROLES) hidden[role] = 0;

  const list = candidates(root, input, random() < spec.shopping);
  if (list.length === 0) return undefined;
  const reply = (c: Candidate): BotMove => ({ uci: makeUci(c.move), score: Math.round(c.score), ...(c.buy ? { buy: c.buy } : {}) });
  if (list.length === 1) return reply(list[0]!);
  // A deliberate slip: any free move (never one that costs seeds).
  if (random() < spec.blunder) {
    const free = list.filter(c => !c.buy);
    if (free.length > 0) return reply(free[Math.floor(random() * free.length)]!);
  }

  const seen = new Set(input.positions ?? []);
  const search: Search = { deadline: Date.now() + (input.timeMs ?? spec.timeMs), nodes: 0, quiescence: spec.quiescence };
  // Without noise the root can prune; with noise every candidate needs its true score.
  const exact = spec.noise > 0;
  let ranked = list;
  try {
    for (let depth = 1; depth <= spec.depth; depth++) {
      let alpha = -Infinity;
      const scored: Candidate[] = [];
      for (const c of ranked) {
        let score = -negamax(search, c.after, depth - 1, -Infinity, exact ? Infinity : -(alpha + c.cost), 1) - c.cost;
        // Ahead? Then don't walk back into a position we have already had.
        if (score > 50 && seen.has(positionKey(c.after))) score -= 60;
        scored.push({ ...c, score });
        if (score > alpha) alpha = score;
      }
      // Best first: the next, deeper pass prunes better and the answer is at the front.
      ranked = scored.sort((a, b) => b.score - a.score);
      if (ranked[0]!.score > MATE - MAX_PLY * 2) break;
    }
  } catch (e) {
    if (!(e instanceof OutOfTime)) throw e;
    // Keep the ranking from the last depth that finished.
  }

  if (spec.noise > 0) {
    ranked = ranked.map(c => ({ ...c, score: c.score + (random() * 2 - 1) * spec.noise })).sort((a, b) => b.score - a.score);
  }
  return reply(ranked[0]!);
};

/** Would `bot` take a draw here? Yes when it is clearly worse. */
export const acceptsDraw = (fen: string, bot: Color): boolean => {
  const pos = positionFromFen(fen);
  const hidden = pos.pockets?.[opposite(bot)];
  if (hidden) for (const role of SHOP_ROLES) hidden[role] = 0;
  const search: Search = { deadline: Date.now() + 300, nodes: 0, quiescence: true };
  let score: number;
  try {
    score = negamax(search, pos, 2, -Infinity, Infinity, 0);
  } catch {
    score = evaluate(pos);
  }
  return (pos.turn === bot ? score : -score) < -150;
};
