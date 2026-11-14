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
  const hint =
    total === 0
      ? 'Empty'
      : props.selected
        ? 'Now tap a marked square'
        : props.canDrop
          ? 'Drag or tap a piece to drop it'
          : 'Drop on your turn';

  return (
    <section className={`backpack ${props.canDrop && total > 0 ? 'ready' : ''}`} aria-label="Backpack">
      <BackpackArt />
      <div className="backpack-tag">
        <h3>Backpack</h3>
        <p>{hint}</p>
      </div>
      <div className="backpack-slots">
        {SHOP_ROLES.map(role => {
          const n = pocket[role];
          const usable = n > 0 && props.canDrop;
          const name = ROLE_NAMES[role].toLowerCase();
          return (
            <button
              key={role}
              type="button"
              className={`backpack-slot ${n === 0 ? 'empty' : ''} ${props.selected === role ? 'selected' : ''}`}
              disabled={!usable}
              aria-label={n > 0 ? `${n} ${name}${n === 1 ? '' : 's'}` : `No ${name}s`}
              aria-pressed={props.selected === role}
              title={n > 0 ? `${ROLE_NAMES[role]} ×${n}` : `No ${name}s`}
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

/** The pack itself: grab handle, side pockets, buckled flap and a zipped front pocket. */
function BackpackArt() {
  return (
    <svg className="backpack-art" viewBox="0 0 360 214" aria-hidden="true">
      <path className="bp-handle" d="M148 24C148 0 212 0 212 24" fill="none" strokeWidth="9" strokeLinecap="round" />
      <rect className="bp-side" x="2" y="92" width="44" height="104" rx="15" />
      <rect className="bp-side" x="314" y="92" width="44" height="104" rx="15" />
      <path className="bp-body" d="M16 78Q16 18 78 18H282Q344 18 344 78V186Q344 210 320 210H40Q16 210 16 186Z" />
      <rect className="bp-pocket" x="26" y="112" width="308" height="92" rx="14" />
      <path className="bp-stitch" d="M32 126V190Q32 198 40 198H320Q328 198 328 190V126" fill="none" />
      <path className="bp-flap" d="M16 78Q16 18 78 18H282Q344 18 344 78V86Q344 102 322 104Q180 120 38 104Q16 102 16 86Z" />
      <path className="bp-stitch" d="M24 80Q24 26 80 26H280Q336 26 336 80V84Q336 94 320 96Q180 111 40 96Q24 94 24 84Z" fill="none" />
      {[62, 282].map(x => (
        <g key={x}>
          <rect className="bp-strap" x={x} y="62" width="16" height="62" rx="3" />
          <rect className="bp-buckle" x={x - 4} y="94" width="24" height="17" rx="3.5" fill="none" strokeWidth="4" />
          <path className="bp-buckle" d={`M${x - 2} 102.5H${x + 18}`} strokeWidth="2.5" />
        </g>
      ))}
      <path className="bp-zip" d="M92 121H268" fill="none" strokeWidth="3" strokeDasharray="2 3" />
      <rect className="bp-zip-pull" x="262" y="117" width="14" height="8" rx="3" />
    </svg>
  );
}
