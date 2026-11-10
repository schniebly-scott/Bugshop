export { type BugshopConfig, type ShopRole, DEFAULT_CONFIG, SHOP_ROLES, makeConfig } from './config.ts';
export { type ClockState, elapsedAt } from './clock.ts';
export { BugshopPosition, INITIAL_FEN, positionFromFen, positionToFen } from './position.ts';
export {
  type Action,
  type ActionResult,
  type CreateGameOptions,
  type GameEvent,
  type GameState,
  type GameStatus,
  type RuleError,
  applyAction,
  coinsAt,
  coinsEarned,
  createGame,
  dropDests,
  elapsed,
  getPosition,
  legalDests,
  pockets,
  turnOf,
} from './game.ts';
