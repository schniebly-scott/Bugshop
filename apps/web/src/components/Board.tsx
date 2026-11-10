import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import { dragNewPiece } from '@lichess-org/chessground/drag';
import type { Key, MouchEvent, Piece } from '@lichess-org/chessground/types';
import type { Color, Role, SquareName } from 'chessops';

export interface BoardHandle {
  /** Start dragging a piece from a pocket onto the board. */
  dragFromPocket(piece: Piece, e: MouchEvent): void;
}

export interface BoardProps {
  ref?: Ref<BoardHandle>;
  fen: string;
  orientation: Color;
  turnColor: Color;
  /** Color allowed to move pieces, or undefined when the board is read-only. */
  movableColor: Color | undefined;
  dests: Map<SquareName, SquareName[]>;
  lastMove: SquareName[] | undefined;
  check: Color | false;
  /** Squares highlighted as legal drop targets for the selected pocket piece. */
  dropTargets: SquareName[];
  /** Return false to reject the move (the board then snaps back). */
  onMove(orig: SquareName, dest: SquareName): boolean;
  onDrop(role: Role, dest: SquareName): boolean;
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
      premovable: { enabled: false },
      predroppable: { enabled: false },
      draggable: { showGhost: true },
      animation: { enabled: true, duration: 180 },
      movable: {
        ...config().movable,
        events: {
          after: (orig, dest) => {
            if (!latest.current.onMove(orig as SquareName, dest as SquareName)) resync();
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
    const { highlight: _, ...rest } = config();
    api.current?.set(rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen, props.orientation, props.turnColor, props.movableColor, props.dests, props.lastMove, props.check]);

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
  }));

  return <div ref={el} className="board" />;
}
