import type { Role } from 'chessops';

/** Roles that can be bought in the shop (everything except the king). */
export type ShopRole = Exclude<Role, 'king'>;
export const SHOP_ROLES: readonly ShopRole[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

export interface BugshopConfig {
  /** Milliseconds of opponent time that earn you one coin. */
  msPerCoin: number;
  /** Coin price of each buyable piece. */
  prices: Record<ShopRole, number>;
  /** Coin price of the "Claim Victory" shop item (instant win). */
  claimVictoryPrice: number;
  /** Draw when the same position (incl. pockets and side to move) occurs a third time. */
  threefoldRepetition: boolean;
  /** Draw after 50 moves by each side with no capture, pawn move or pawn drop. */
  fiftyMoveRule: boolean;
}

export const DEFAULT_CONFIG: BugshopConfig = {
  msPerCoin: 60_000,
  prices: { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 },
  claimVictoryPrice: 30,
  threefoldRepetition: true,
  fiftyMoveRule: true,
};

const isPositiveInt = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

/** Build a config from defaults plus overrides. Throws on nonsensical values. */
export const makeConfig = (overrides: Partial<BugshopConfig> = {}): BugshopConfig => {
  const config: BugshopConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    prices: { ...DEFAULT_CONFIG.prices, ...overrides.prices },
  };
  if (!isPositiveInt(config.msPerCoin)) throw new RangeError('msPerCoin must be a positive integer');
  if (!isPositiveInt(config.claimVictoryPrice)) throw new RangeError('claimVictoryPrice must be a positive integer');
  for (const role of SHOP_ROLES) {
    if (!isPositiveInt(config.prices[role])) throw new RangeError(`price of ${role} must be a positive integer`);
  }
  return config;
};
