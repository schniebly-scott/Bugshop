import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { opposite, parseSquare, type ByColor, type Color, type Role, type SquareName } from 'chessops';
import { type Action, type GameState, type ShopRole, dropDests, getPosition, legalDests, turnOf } from '@bugshop/rules';
import type { SeatStatus } from '@bugshop/protocol';
import { Board, type BoardHandle } from './Board';
import { PlayerBar } from './PlayerBar';
import { Backpack } from './Backpack';
import { ShopScroll } from './ShopScroll';
import { ConfirmButton } from './ConfirmButton';
import { PromotionDialog } from './PromotionDialog';
import { SeedIcon, ShoeIcon } from './icons';
import { ROLE_LETTER, boardFen, lastMoveSquares, resultText } from '../game/view';

const NO_SQUARES: SquareName[] = [];
const PROMOTION_LETTER: Partial<Record<Role, string>> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

export interface GameViewProps {
  state: GameState;
  /** Current time on the game's clock (server-adjusted when online). */
  now: number;
  /** Colors the person at this screen controls: both in hotseat, one online. */
  controls: Color[];
  /** Colors whose seeds and backpack this screen may see. */
  revealed: Color[];
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

/** Board, backpacks, market and player bars. Shared by hotseat and online play. */
export function GameView(props: GameViewProps) {
  const { state, now, controls, orientation, act } = props;
  const playing = state.status === 'playing';
  const turn = turnOf(state);
  const boardRef = useRef<BoardHandle>(null);
  const canMove = playing && controls.includes(turn);
  const top = opposite(orientation);
  const bottom = orientation;

  // Who is using the market. Online: you. Hotseat: the side to move by default,
  // switchable so the other player can buy on their opponent's turn.
  const [shopper, setShopper] = useState<Color>(controls.includes(turn) ? turn : (controls[0] ?? bottom));
  useEffect(() => {
    if (controls.length > 1) setShopper(turn);
  }, [turn, controls.length]);
  const buyer = controls.includes(shopper) ? shopper : (controls[0] ?? bottom);

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

  // Whose backpack is open: the player at the bottom, or in hotseat whoever is to move
  // (they are the one who can drop). The other player's pocket shows in their bar.
  const packOwner = controls.includes(turn) && props.revealed.includes(turn) ? turn : bottom;

  const backpack = (color: Color) =>
    props.revealed.includes(color) ? (
      <Backpack
        color={color}
        state={state}
        canDrop={canMove && color === turn}
        selected={selectedDrop?.color === color ? selectedDrop.role : null}
        onPick={(role, e) => {
          setSelectedDrop({ color, role });
          boardRef.current?.dragFromPocket({ role, color }, e.nativeEvent);
        }}
        onSelect={role => setSelectedDrop({ color, role })}
      />
    ) : null;

  const bar = (color: Color) => (
    <PlayerBar
      color={color}
      label={props.label(color)}
      state={state}
      now={now}
      revealed={props.revealed.includes(color)}
      seat={props.seats?.[color]}
      showPocket={color !== packOwner}
    />
  );

  const result = resultText(state);
  const opponentOfBuyer = opposite(buyer);
  const canAct = playing && controls.includes(buyer);

  return (
    <main className="game-layout">
      <section className="board-column">
        {bar(top)}
        <div className="board-area">
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
          <div className="board-toast" role="status" aria-live="polite">
            {!result && props.message ? <span>{props.message}</span> : null}
          </div>
        </div>
        {bar(bottom)}
        <div className="result-line" role="status" aria-live="polite">
          {result ? <strong className="result">{result}</strong> : null}
        </div>
      </section>

      <aside className="side-column">
        {backpack(packOwner)}

        {controls.length > 0 && (
          <ShopScroll
            color={buyer}
            state={state}
            now={now}
            enabled={canAct}
            onBuy={role => act(buyer, { type: 'buy', role })}
            onSquish={() => act(buyer, { type: 'squish' })}
            shopperSwitch={controls.length > 1 ? { onSwitch: setShopper } : undefined}
          />
        )}

        <section className="camp-card" aria-label="Game controls">
          {controls.length > 0 && playing && (
            <div className="game-actions">
              {state.drawOffer === opponentOfBuyer ? (
                <>
                  <span className="draw-offer">{props.label(opponentOfBuyer)} offers a draw</span>
                  <button type="button" className="primary" disabled={!canAct} onClick={() => act(buyer, { type: 'acceptDraw' })}>Accept</button>
                  <button type="button" disabled={!canAct} onClick={() => act(buyer, { type: 'declineDraw' })}>Decline</button>
                </>
              ) : (
                <button type="button" disabled={!canAct || state.drawOffer === buyer} onClick={() => act(buyer, { type: 'offerDraw' })}>
                  {state.drawOffer === buyer ? 'Draw offered' : 'Offer draw'}
                </button>
              )}
              <ConfirmButton disabled={!canAct} onConfirm={() => act(buyer, { type: 'resign' })} confirmLabel="Really resign?">
                Resign
              </ConfirmButton>
            </div>
          )}
          <div className="controls">{props.children}</div>
          <p className="rules-line">
            <span>
              <SeedIcon /> 1 seed per {state.config.msPerCoin / 1000}s
            </span>
            <span>
              <ShoeIcon /> Squish for {state.config.squishPrice}
            </span>
          </p>
        </section>
      </aside>

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
