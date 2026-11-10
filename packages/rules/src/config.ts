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
}

export const DEFAULT_CONFIG: BugshopConfig = {
  msPerCoin: 60_000,
  prices: { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 },
  claimVictoryPrice: 30,
};

export const makeConfig = (overrides: Partial<BugshopConfig> = {}): BugshopConfig => ({
  ...DEFAULT_CONFIG,
  ...overrides,
  prices: { ...DEFAULT_CONFIG.prices, ...overrides.prices },
});
