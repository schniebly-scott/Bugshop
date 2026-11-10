import type { Color, Role } from 'chessops';

/** A chess piece drawn with the board's piece set. */
export function PieceIcon({ color, role }: { color: Color; role: Role }) {
  return (
    <span className="cg-wrap piece-icon" aria-hidden="true">
      <piece className={`${color} ${role}`} />
    </span>
  );
}
