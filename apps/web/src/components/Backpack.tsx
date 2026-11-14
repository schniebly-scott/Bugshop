import type { MouseEvent, TouchEvent } from 'react';
import type { Color } from 'chessops';
import { type GameState, type ShopRole, SHOP_ROLES, pockets } from '@bugshop/rules';
import { PieceIcon } from './PieceIcon';
import { ROLE_NAMES } from '../game/view';

/** A player's pocket: bought pieces waiting to be dropped, drawn as a backpack. */
export function Backpack(props: {
  color: Color;
  state: GameState;
  /** Can this screen drop from it right now (own pocket, own turn)? */
  canDrop: boolean;
  selected: ShopRole | null;
  onPick(role: ShopRole, e: MouseEvent | TouchEvent): void;
  onSelect(role: ShopRole): void;
}) {
  const pocket = pockets(props.state)[props.color];
  const total = SHOP_ROLES.reduce((n, r) => n + pocket[r], 0);

  return (
    <section className="backpack" aria-label="Backpack (pocket)">
      <div className="backpack-flap">
        <span className="backpack-buckle" aria-hidden="true" />
        <span className="backpack-title">Backpack</span>
        <span className="backpack-hint">{total === 0 ? 'empty: buy pieces at the market' : props.canDrop ? 'drag or tap a piece to drop it' : ''}</span>
      </div>
      <div className="backpack-slots">
        {SHOP_ROLES.map(role => {
          const n = pocket[role];
          const usable = n > 0 && props.canDrop;
          return (
            <button
              key={role}
              type="button"
              className={`backpack-slot ${n === 0 ? 'empty' : ''} ${props.selected === role ? 'selected' : ''}`}
              disabled={!usable}
              title={n > 0 ? `${ROLE_NAMES[role]} ×${n}` : `No ${ROLE_NAMES[role].toLowerCase()}s`}
              onMouseDown={e => usable && e.button === 0 && props.onPick(role, e)}
              onTouchStart={e => usable && props.onPick(role, e)}
              onClick={() => usable && props.onSelect(role)}
            >
              <PieceIcon color={props.color} role={role} />
              {n > 0 && <span className="count">{n}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
