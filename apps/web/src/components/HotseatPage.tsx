import { useEffect, useMemo, useRef, useState } from 'react';
import { opposite, parseSquare, type Color, type Role, type SquareName } from 'chessops';
import { type ShopRole, dropDests, getPosition, legalDests, turnOf } from '@bugshop/rules';
import { Board, type BoardHandle } from './Board';
import { PlayerPanel } from './PlayerPanel';
import { PromotionDialog } from './PromotionDialog';
import { ConfirmButton } from './ConfirmButton';
import { useHotseatGame } from '../game/useHotseatGame';
import { useNow } from '../game/useNow';
import { ROLE_LETTER, boardFen, errorText, lastMoveSquares, resultText } from '../game/view';

const NO_SQUARES: SquareName[] = [];
const PROMOTION_LETTER: Partial<Record<Role, string>> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

export function HotseatPage() {
  const { state, act, newGame, lastError, clearError } = useHotseatGame();
  const playing = state.status === 'playing';
  const now = useNow(playing);
  const turn = turnOf(state);
  const boardRef = useRef<BoardHandle>(null);

  const [autoFlip, setAutoFlip] = useState(true);
  const [manualOrientation, setManualOrientation] = useState<Color>('white');
  const orientation = autoFlip ? turn : manualOrientation;

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
  useEffect(() => {
    if (!lastError) return;
    const id = setTimeout(clearError, 2500);
    return () => clearTimeout(id);
  }, [lastError]);

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
    <main className="hotseat">
      <div className="area-top">{panel(opposite(orientation))}</div>

      <div className="area-board">
        <div className="board-frame">
          <Board
            key={syncToken}
            ref={boardRef}
            fen={boardFen(state.fen)}
            orientation={orientation}
            turnColor={turn}
            movableColor={playing ? turn : undefined}
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
          {result ? <strong className="result">{result}</strong> : lastError ? <span className="error">{errorText(lastError)}</span> : null}
        </div>
      </div>

      <div className="area-bottom">{panel(orientation)}</div>

      <div className="area-controls controls">
        <label className="toggle">
          <input type="checkbox" checked={autoFlip} onChange={e => setAutoFlip(e.target.checked)} />
          Flip board each turn
        </label>
        <button type="button" disabled={autoFlip} onClick={() => setManualOrientation(o => opposite(o))}>
          Flip board
        </button>
        {playing ? (
          <ConfirmButton onConfirm={newGame} confirmLabel="Abandon this game?">New game</ConfirmButton>
        ) : (
          <button type="button" className="primary" onClick={newGame}>New game</button>
        )}
      </div>

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
