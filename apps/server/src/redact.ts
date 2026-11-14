import { opposite, type Color } from 'chessops';
import { type GameState, SHOP_ROLES, positionFromFen, positionToFen } from '@bugshop/rules';

/**
 * The game as `viewer` may see it. A player's pocket is secret from their
 * opponent until the game ends, so for the opponent's side this removes:
 * - their pocket contents (from the FEN),
 * - their purchases (from the history),
 * - how much they have spent (which would reveal what they bought),
 * - the repetition keys (they encode both pockets).
 * Dropping a piece reveals it, as on the board. Finished games are shown in full.
 */
export const redactFor = (game: GameState, viewer: Color): GameState => {
  if (game.status !== 'playing') return game;
  const hidden = opposite(viewer);

  const pos = positionFromFen(game.fen);
  for (const role of SHOP_ROLES) pos.pockets![hidden][role] = 0;

  return {
    ...game,
    fen: positionToFen(pos),
    spent: { ...game.spent, [hidden]: 0 },
    history: game.history.filter(e => !(e.type === 'buy' && e.by === hidden)),
    positions: [],
  };
};
