import type { Color, Role, SquareName } from 'chessops';
import type { GameState, RuleError, ShopRole } from '@bugshop/rules';
import type { ActionRejection } from '@bugshop/protocol';

/** Board-only FEN for chessground (strips the `[pockets]` part). */
export const boardFen = (fen: string): string => fen.split(' ')[0]!.split('[')[0]!;

/** Squares to highlight for the last move: [from, to] for moves, [to] for drops. */
export const lastMoveSquares = (state: GameState): SquareName[] | undefined => {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const e = state.history[i]!;
    if (e.type !== 'move') continue;
    if (e.uci.includes('@')) return [e.uci.slice(2, 4) as SquareName];
    return [e.uci.slice(0, 2) as SquareName, e.uci.slice(2, 4) as SquareName];
  }
  return undefined;
};

/** Count-up clock display: m:ss, or h:mm:ss after an hour. */
export const formatClock = (ms: number): string => {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export const colorName = (c: Color): string => (c === 'white' ? 'White' : 'Black');

export const ROLE_NAMES: Record<Role, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
};

export const ROLE_LETTER: Record<ShopRole, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q' };

const ERROR_TEXT: Record<ActionRejection | 'network', string> = {
  'not-started': 'The game has not started yet.',
  'not-a-player': 'You are not playing in this game.',
  network: 'Could not reach the server. Try again.',
  'game-over': 'The game is already over.',
  'not-your-turn': "It isn't your turn.",
  'invalid-uci': 'That move could not be understood.',
  'illegal-move': 'Illegal move.',
  'unknown-role': 'That piece is not for sale.',
  'not-enough-coins': 'Not enough coins.',
  'pocket-full': 'Your pocket is full.',
  'draw-already-offered': 'You already offered a draw.',
  'no-draw-offer': 'There is no draw offer to answer.',
};
export const errorText = (e: RuleError | ActionRejection | 'network'): string => ERROR_TEXT[e] ?? ERROR_TEXT.network;

export const resultText = (state: GameState): string | undefined => {
  const w = state.winner ? colorName(state.winner) : undefined;
  switch (state.status) {
    case 'playing':
      return undefined;
    case 'checkmate':
      return `Checkmate. ${w} wins.`;
    case 'stalemate':
      return 'Stalemate. The game is a draw.';
    case 'resign':
      return `${state.winner === 'white' ? 'Black' : 'White'} resigned. ${w} wins.`;
    case 'claimVictory':
      return `${w} bought Claim Victory and wins.`;
    case 'drawAgreed':
      return 'Draw agreed.';
  }
};
