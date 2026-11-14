import type { Color } from 'chessops';
import { type GameState, type ShopRole, SHOP_ROLES, coinsAt } from '@bugshop/rules';
import { PieceIcon } from './PieceIcon';
import { ConfirmButton } from './ConfirmButton';
import { ShoeIcon, SeedIcon } from './icons';
import { ROLE_NAMES, colorName } from '../game/view';

const seeds = (n: number) => `${n} ${n === 1 ? 'seed' : 'seeds'}`;

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
      <div className="scroll-roll" aria-hidden="true" />
      <div className="scroll-paper">
        <h3 className="scroll-title">Stump Market</h3>
        <div className="purse-row">
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
          <p className="purse" aria-label={`${seeds(coins)} to spend`}>
            <SeedIcon /> <strong>{coins}</strong> <span>{coins === 1 ? 'seed' : 'seeds'}</span>
          </p>
        </div>
        <div className="shop-grid">
          {SHOP_ROLES.map(role => {
            const price = state.config.prices[role];
            const short = price - coins;
            const label = `Buy a ${ROLE_NAMES[role].toLowerCase()} for ${seeds(price)}`;
            return (
              <button
                key={role}
                type="button"
                className="shop-item"
                disabled={!props.enabled || short > 0}
                onClick={() => props.onBuy(role)}
                aria-label={label}
                title={short > 0 ? `${ROLE_NAMES[role]}: ${seeds(short)} short` : label}
              >
                <PieceIcon color={color} role={role} />
                <span className="price">
                  <SeedIcon /> {price}
                </span>
              </button>
            );
          })}
        </div>
        <ConfirmButton
          className="squish"
          disabled={!props.enabled || coins < squishPrice}
          onConfirm={props.onSquish}
          confirmLabel={`Squish for ${seeds(squishPrice)}? Tap again`}
          title="Squish your opponent and win on the spot. Handy when they've wandered off."
        >
          <ShoeIcon />
          <span className="squish-text">
            <strong>Squish!</strong>
            <small>Win on the spot</small>
          </span>
          <span className="price">
            <SeedIcon /> {squishPrice}
          </span>
        </ConfirmButton>
      </div>
      <div className="scroll-roll" aria-hidden="true" />
    </section>
  );
}
