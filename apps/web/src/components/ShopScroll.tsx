import type { Color } from 'chessops';
import { type GameState, type ShopRole, SHOP_ROLES, coinsAt } from '@bugshop/rules';
import { PieceIcon } from './PieceIcon';
import { ConfirmButton } from './ConfirmButton';
import { ShoeIcon, SeedIcon } from './icons';
import { ROLE_NAMES, colorName } from '../game/view';

/** The Stump Market: buy pieces (any time) or Squish the opponent, on a parchment scroll. */
export function ShopScroll(props: {
  /** Who is shopping. */
  color: Color;
  state: GameState;
  now: number;
  enabled: boolean;
  onBuy(role: ShopRole): void;
  onSquish(): void;
  /** Hotseat: lets either player shop (buying is allowed on the opponent's turn). */
  shopperSwitch?: { onSwitch(c: Color): void };
}) {
  const { color, state } = props;
  const coins = coinsAt(state, color, props.now);
  const squishPrice = state.config.squishPrice;

  return (
    <section className="scroll" aria-label="Stump Market">
      <div className="scroll-paper">
        <h3 className="scroll-title">Stump Market</h3>
        {props.shopperSwitch ? (
          <div className="shopper-switch" role="radiogroup" aria-label="Shopping for">
            {(['white', 'black'] as const).map(c => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                className={c === color ? 'chosen' : ''}
                onClick={() => props.shopperSwitch!.onSwitch(c)}
              >
                {colorName(c)}
              </button>
            ))}
          </div>
        ) : null}
        <p className="purse">
          <SeedIcon /> <strong>{coins}</strong> {coins === 1 ? 'seed' : 'seeds'} to spend
        </p>
        <div className="shop-grid">
          {SHOP_ROLES.map(role => {
            const price = state.config.prices[role];
            return (
              <button
                key={role}
                type="button"
                className="shop-item"
                disabled={!props.enabled || coins < price}
                onClick={() => props.onBuy(role)}
                title={`Buy a ${ROLE_NAMES[role].toLowerCase()} for ${price} ${price === 1 ? 'seed' : 'seeds'}`}
              >
                <PieceIcon color={color} role={role} />
                <span className="item-name">{ROLE_NAMES[role]}</span>
                <span className="price">
                  <SeedIcon /> {price}
                </span>
              </button>
            );
          })}
          <ConfirmButton
            className="shop-item squish"
            disabled={!props.enabled || coins < squishPrice}
            onConfirm={props.onSquish}
            confirmLabel={`Squish for ${squishPrice}?`}
            title="Squish your opponent: win immediately. Handy when they've wandered off."
          >
            <ShoeIcon />
            <span className="item-name">Squish!</span>
            <span className="price">
              <SeedIcon /> {squishPrice}
            </span>
          </ConfirmButton>
        </div>
      </div>
    </section>
  );
}
