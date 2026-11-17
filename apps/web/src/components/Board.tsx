import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import { dropNewPiece } from '@lichess-org/chessground/board';
import { dragNewPiece } from '@lichess-org/chessground/drag';
import type { Drop, Key, MouchEvent, Piece } from '@lichess-org/chessground/types';
import type { Color, Role, SquareName } from 'chessops';

export interface BoardHandle {
  /** Start dragging a piece from a pocket onto the board. */
  dragFromPocket(piece: Piece, e: MouchEvent): void;
  /** Queue a pocket piece to be dropped on `dest` as soon as it is our turn (tap-to-drop). */
  predrop(piece: Piece, dest: SquareName): void;
}

export interface BoardProps {
  ref?: Ref<BoardHandle>;
  fen: string;
  orientation: Color;
  turnColor: Color;
  /**
   * Color allowed to move pieces, or undefined when the board is read-only.
   * With `premovable`, this stays set during the opponent's turn: moves made
   * then are queued and played as soon as the turn comes back.
   */
  movableColor: Color | undefined;
  /** Allow pre-moves and pre-drops (only when one player sits at this screen). */
  premovable: boolean;
  dests: Map<SquareName, SquareName[]>;
  lastMove: SquareName[] | undefined;
  check: Color | false;
  /** Squares highlighted as legal drop targets for the selected pocket piece. */
  dropTargets: SquareName[];
  /** Return false to reject the move (the board then snaps back). `premove` is true for a queued move being played. */
  onMove(orig: SquareName, dest: SquareName, premove: boolean): boolean;
  onDrop(role: Role, dest: SquareName): boolean;
  /** A queued pre-drop is about to be played: return false to discard it instead. */
  canPredrop(role: Role, dest: SquareName): boolean;
  onSquareClick(key: SquareName): void;
}

export function Board(props: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  // Chessground keeps the callbacks it was created with; route them through a ref
  // so they always see the latest props.
  const latest = useRef(props);
  latest.current = props;

  const resync = () => api.current?.set({ fen: latest.current.fen, lastMove: latest.current.lastMove as Key[] });

  const config = (): Config => ({
    fen: props.fen,
    orientation: props.orientation,
    turnColor: props.turnColor,
    check: props.check,
    lastMove: props.lastMove as Key[] | undefined,
    movable: {
      free: false,
      color: props.movableColor,
      dests: props.dests as Map<Key, Key[]>,
      showDests: true,
    },
    highlight: {
      lastMove: true,
      check: true,
      custom: new Map(props.dropTargets.map(sq => [sq as Key, 'drop-dest'])),
    },
  });

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      ...config(),
      coordinates: true,
      premovable: { enabled: props.premovable, showDests: true, castle: true },
      predroppable: { enabled: props.premovable },
      draggable: { showGhost: true },
      animation: { enabled: true, duration: 180 },
      movable: {
        ...config().movable,
        events: {
          after: (orig, dest, meta) => {
            if (!latest.current.onMove(orig as SquareName, dest as SquareName, meta.premove)) resync();
          },
          afterNewPiece: (role, dest) => {
            if (!latest.current.onDrop(role, dest as SquareName)) resync();
          },
        },
      },
      events: {
        select: key => latest.current.onSquareClick(key as SquareName),
      },
    });
    return () => {
      api.current?.destroy();
      api.current = null;
    };
    // Create once; later prop changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only push changes to chessground when board-relevant props change: the page
  // re-renders every clock tick, and resetting the board mid-drag would cancel it.
  // Callers must memoize `dests`, `lastMove` and `dropTargets`.
  useEffect(() => {
    const cg = api.current;
    if (!cg) return;
    const { highlight: _, ...rest } = config();
    cg.set({ ...rest, premovable: { enabled: props.premovable }, predroppable: { enabled: props.premovable } });
    if (!props.premovable || !props.movableColor) {
      cg.cancelPremove();
      cg.cancelPredrop();
    } else if (props.turnColor === props.movableColor) {
      // Our turn has come: play what was queued. chessground re-checks a premove
      // against the new legal dests; a pre-drop is checked by the caller. Either
      // way the move then goes through the rules engine like any other.
      if (!cg.playPremove()) cg.playPredrop((d: Drop) => latest.current.canPredrop(d.role, d.key as SquareName));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen, props.orientation, props.turnColor, props.movableColor, props.premovable, props.dests, props.lastMove, props.check]);

  // Drop highlights change when a pocket piece is picked up. Update them on their
  // own: re-sending the FEN would delete the piece currently being dragged.
  useEffect(() => {
    api.current?.set({ highlight: config().highlight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.dropTargets]);

  useImperativeHandle(props.ref, () => ({
    dragFromPocket(piece, e) {
      if (api.current) dragNewPiece(api.current.state, piece, e);
    },
    predrop(piece, dest) {
      const cg = api.current;
      if (!cg) return;
      // The same steps chessground's own tap-to-drop mode takes: put the piece on the
      // off-board square a0 and drop it from there. Off-turn, that queues a pre-drop.
      cg.state.pieces.set('a0', piece);
      dropNewPiece(cg.state, 'a0', dest as Key);
      cg.state.dom.redraw();
    },
  }));

  return <div ref={el} className="board" />;
}
