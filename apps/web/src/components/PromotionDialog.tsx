import type { Color, Role } from 'chessops';
import { PieceIcon } from './PieceIcon';
import { ROLE_NAMES } from '../game/view';

const CHOICES: Role[] = ['queen', 'knight', 'rook', 'bishop'];

export function PromotionDialog(props: { color: Color; onChoose(role: Role): void; onCancel(): void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Choose promotion piece" onClick={props.onCancel}>
      <div className="promotion" onClick={e => e.stopPropagation()}>
        <p>Promote to</p>
        <div className="promotion-choices">
          {CHOICES.map(role => (
            <button key={role} type="button" className="promotion-choice" onClick={() => props.onChoose(role)} title={ROLE_NAMES[role]}>
              <PieceIcon color={props.color} role={role} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
