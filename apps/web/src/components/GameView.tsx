import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { opposite, parseSquare, type ByColor, type Color, type Role, type SquareName } from 'chessops';
import { type Action, type GameState, type ShopRole, dropDests, getPosition, legalDests, turnOf } from '@bugshop/rules';
import type { SeatStatus } from '@bugshop/protocol';
import { Board, type BoardHandle } from './Board';
import { PlayerPanel } from './PlayerPanel';
import { PromotionDialog } from './PromotionDialog';
import { ROLE_LETTER, boardFen, lastMoveSquares, resultText } from '../game/view';

const NO_SQUARES: SquareName[] = [];
const PROMOTION_LETTER: Partial<Record<Role, string>> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

export interface GameViewProps {
  state: GameState;
  /** Current time on the game's clock (server-adjusted when online). */
  now: number;
  /** Colors the person at this screen controls: both in hotseat, one online. */
  controls: Color[];
  orientation: Color;
  /** Perform an action. Return false if it was refused (the board snaps back). */
  act(by: Color, action: Action): boolean;
  /** Human-readable error to show under the board. */
  message: string | null;
  label(color: Color): string;
  seats?: ByColor<SeatStatus>;
  /** Extra controls (flip board, leave, new game…). */
  children?: ReactNode;
}

/** Board + both player panels. Shared by hotseat and online play. */
export function GameView({ state, now, controls, orientation, act, message, label, seats, children }: GameViewProps) {
  const playing = state.status === 'playing';
  const turn = turnOf(state);
  const boardRef = useRef<BoardHandle>(null);
  const canMove = playing && controls.includes(turn);

  const [selectedDrop, setSelectedDrop] = useState<{ color: Color; role: ShopRole } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ orig: SquareName; dest: SquareName } | null>(null);
  // Bumped to force the board back to the real position (e.g. promotion cancelled).
  const [syncToken, setSyncToken] = useState(0);

  // Board-facing values are memoized so the board only updates when the position does.
  const position = useMemo(() => getPosition(state), [state.fen]);
  const dests = useMemo(() => legalDests(state), [state.fen, state.status]);
  const lastMove = useMemo(() => lastMoveSquares(state), [state.history]);
  const check = playing && position.isCheck() ? turn : false;
  const dropTargets = useMemo(
    () => (selectedDrop && selectedDrop.color === turn ? dropDests(state, selectedDrop.role) : NO_SQUARES),
    [selectedDrop, state.fen, state.status],
  );

  useEffect(() => setSelectedDrop(null), [state.fen]);

  const drop = (role: ShopRole | Role, dest: SquareName): boolean => {
    setSelectedDrop(null);
    if (role === 'king') return false;
    return act(turn, { type: 'move', uci: `${ROLE_LETTER[role]}@${dest}` });
  };

  const onMove = (orig: SquareName, dest: SquareName): boolean => {
    const piece = position.board.get(parseSquare(orig));
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) {
      setPendingPromotion({ orig, dest });
      return true; // keep the pawn on the target square while choosing
    }
    return act(turn, { type: 'move', uci: orig + dest });
  };

  const onSquareClick = (key: SquareName) => {
    if (!selectedDrop) return;
    if (dropTargets.includes(key)) drop(selectedDrop.role, key);
    else setSelectedDrop(null);
  };

  const panel = (color: Color) => (
    <PlayerPanel
      color={color}
      label={label(color)}
      interactive={controls.includes(color)}
      seat={seats?.[color]}
      state={state}
      now={now}
      selectedDrop={selectedDrop?.color === color ? selectedDrop.role : null}
      onBuy={role => act(color, { type: 'buy', role })}
      onPocketPick={(role, e) => {
        setSelectedDrop({ color, role });
        boardRef.current?.dragFromPocket({ role, color }, e.nativeEvent);
      }}
      onPocketClick={role => setSelectedDrop({ color, role })}
      onClaimVictory={() => act(color, { type: 'claimVictory' })}
      onResign={() => act(color, { type: 'resign' })}
      onOfferDraw={() => act(color, { type: 'offerDraw' })}
      onAcceptDraw={() => act(color, { type: 'acceptDraw' })}
      onDeclineDraw={() => act(color, { type: 'declineDraw' })}
    />
  );

  const result = resultText(state);

  return (
    <main className="game-layout">
      <div className="area-top">{panel(opposite(orientation))}</div>

      <div className="area-board">
        <div className="board-frame">
          <Board
            key={syncToken}
            ref={boardRef}
            fen={boardFen(state.fen)}
            orientation={orientation}
            turnColor={turn}
            movableColor={canMove ? turn : undefined}
            dests={dests}
            lastMove={lastMove}
            check={check}
            dropTargets={dropTargets}
            onMove={onMove}
            onDrop={drop}
            onSquareClick={onSquareClick}
          />
        </div>
        <div className="status-line" role="status" aria-live="polite">
          {result ? <strong className="result">{result}</strong> : message ? <span className="error">{message}</span> : null}
        </div>
      </div>

      <div className="area-bottom">{panel(orientation)}</div>

      <div className="area-controls controls">{children}</div>

      {pendingPromotion && (
        <PromotionDialog
          color={turn}
          onChoose={role => {
            const { orig, dest } = pendingPromotion;
            setPendingPromotion(null);
            if (!act(turn, { type: 'move', uci: orig + dest + PROMOTION_LETTER[role] })) setSyncToken(t => t + 1);
          }}
          onCancel={() => {
            setPendingPromotion(null);
            setSyncToken(t => t + 1);
          }}
        />
      )}
    </main>
  );
}
