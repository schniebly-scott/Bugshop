import type { MouseEvent, TouchEvent } from 'react';
import type { Color } from 'chessops';
import { type GameState, type ShopRole, SHOP_ROLES, coinsAt, elapsed, pockets } from '@bugshop/rules';
import type { SeatStatus } from '@bugshop/protocol';
import { PieceIcon } from './PieceIcon';
import { ConfirmButton } from './ConfirmButton';
import { ROLE_NAMES, colorName, formatClock } from '../game/view';

export interface PlayerPanelProps {
  color: Color;
  /** Heading, e.g. "White", "You (White)". */
  label: string;
  /** Whether the local user controls this player (shop, pocket, game actions). */
  interactive: boolean;
  /** Online presence; omitted in hotseat. */
  seat?: SeatStatus;
  state: GameState;
  now: number;
  /** Pocket piece currently selected for click-to-drop by this player. */
  selectedDrop: ShopRole | null;
  onBuy(role: ShopRole): void;
  onPocketPick(role: ShopRole, e: MouseEvent | TouchEvent): void;
  onPocketClick(role: ShopRole): void;
  onClaimVictory(): void;
  onResign(): void;
  onOfferDraw(): void;
  onAcceptDraw(): void;
  onDeclineDraw(): void;
}

export function PlayerPanel(p: PlayerPanelProps) {
  const { color, state, now } = p;
  const opponent: Color = color === 'white' ? 'black' : 'white';
  const playing = state.status === 'playing';
  const isTurn = playing && state.fen.split(' ')[1] === color[0];
  const canAct = playing && p.interactive;
  const time = elapsed(state, now);
  const coins = coinsAt(state, color, now);
  // Progress toward the next coin, earned from the opponent's running time.
  const coinProgress = (time[opponent] % state.config.msPerCoin) / state.config.msPerCoin;
  const pocket = pockets(state)[color];
  const claimPrice = state.config.claimVictoryPrice;

  return (
    <section className={`player-panel ${isTurn ? 'to-move' : ''}`} aria-label={`${colorName(color)} player`}>
      <header className="player-head">
        <span className={`player-dot ${color}`} aria-hidden="true" />
        <h2>{p.label}</h2>
        {p.seat && p.seat !== 'connected' && (
          <span className={`presence ${p.seat}`}>{p.seat === 'away' ? 'away' : 'waiting…'}</span>
        )}
        <time className="clock" aria-label={`${colorName(color)} time used`}>
          {formatClock(time[color])}
        </time>
      </header>

      <div className="coins" title={`You earn 1 coin per ${state.config.msPerCoin / 1000}s of ${colorName(opponent)}'s time`}>
        <span className="coin-icon" aria-hidden="true" />
        <strong>{coins}</strong>
        <span className="coin-label">{coins === 1 ? 'seed' : 'seeds'}</span>
        <span className="coin-progress" aria-hidden="true">
          <span style={{ width: `${coinProgress * 100}%` }} />
        </span>
      </div>

      <div className="pocket" aria-label="Pocket">
        {SHOP_ROLES.map(role => {
          const n = pocket[role];
          const canDrop = n > 0 && isTurn && p.interactive;
          return (
            <button
              key={role}
              type="button"
              className={`pocket-slot ${n === 0 ? 'empty' : ''} ${p.selectedDrop === role ? 'selected' : ''}`}
              disabled={!canDrop}
              title={n > 0 ? `${ROLE_NAMES[role]} x${n}: drag or click to drop` : `No ${ROLE_NAMES[role].toLowerCase()}s in pocket`}
              onMouseDown={e => canDrop && e.button === 0 && p.onPocketPick(role, e)}
              onTouchStart={e => canDrop && p.onPocketPick(role, e)}
              onClick={() => canDrop && p.onPocketClick(role)}
            >
              <PieceIcon color={color} role={role} />
              {n > 0 && <span className="count">{n}</span>}
            </button>
          );
        })}
      </div>

      {p.interactive && (
        <>
        <div className="shop" aria-label="Shop">
          <h3>Stump market</h3>
          <div className="shop-items">
            {SHOP_ROLES.map(role => {
              const price = state.config.prices[role];
              return (
                <button
                  key={role}
                  type="button"
                  className="shop-item"
                  disabled={!canAct || coins < price}
                  onClick={() => p.onBuy(role)}
                  title={`Buy a ${ROLE_NAMES[role].toLowerCase()} for ${price}`}
                >
                  <PieceIcon color={color} role={role} />
                  <span className="price">{price}</span>
                </button>
              );
            })}
          </div>
          <ConfirmButton
            className="claim"
            disabled={!canAct || coins < claimPrice}
            onConfirm={p.onClaimVictory}
            confirmLabel={`Spend ${claimPrice} and win?`}
            title="Win immediately. Meant for when your opponent has gone absent."
          >
            Claim Victory · {claimPrice}
          </ConfirmButton>
        </div>

        <div className="game-actions">
          {state.drawOffer === opponent ? (
            <>
              <button type="button" disabled={!canAct} onClick={p.onAcceptDraw}>Accept draw</button>
              <button type="button" disabled={!canAct} onClick={p.onDeclineDraw}>Decline</button>
            </>
          ) : (
            <button type="button" disabled={!canAct || state.drawOffer === color} onClick={p.onOfferDraw}>
              {state.drawOffer === color ? 'Draw offered' : 'Offer draw'}
            </button>
          )}
          <ConfirmButton disabled={!canAct} onConfirm={p.onResign} confirmLabel="Really resign?">
            Resign
          </ConfirmButton>
        </div>
        </>
      )}
    </section>
  );
}
