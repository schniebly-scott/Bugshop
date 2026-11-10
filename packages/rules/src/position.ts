import type { Piece, Setup, Square } from 'chessops';
import { makeFen, parseFen } from 'chessops/fen';
import { Crazyhouse } from 'chessops/variant';

// chessops declares variant constructors `private` in its typings, but at runtime
// they are ordinary classes, so we re-type the base to make it extendable.
const CrazyhouseBase = Crazyhouse as unknown as new () => Crazyhouse;

/**
 * A Bugshop position: Crazyhouse (pockets + drops, no pawn drops on the 1st/8th
 * rank) except that captured pieces are NOT added to the capturer's pocket.
 * Pockets are only filled by buying from the shop.
 */
export class BugshopPosition extends CrazyhouseBase {
  static fromSetupChecked(setup: Setup): BugshopPosition {
    const pos = new BugshopPosition();
    pos.setupUnchecked(setup);
    pos.validate().unwrap();
    return pos;
  }

  override clone(): BugshopPosition {
    return super.clone() as BugshopPosition;
  }

  protected override playCaptureAt(square: Square, captured: Piece): void {
    this.halfmoves = 0;
    if (captured.role === 'rook') this.castles.discardRook(square);
  }
}

/** Standard starting position with empty pockets, in Crazyhouse FEN notation. */
export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1';

/** Parse a Crazyhouse FEN into a validated position. Throws on invalid input. */
export const positionFromFen = (fen: string): BugshopPosition =>
  BugshopPosition.fromSetupChecked(parseFen(fen).unwrap());

export const positionToFen = (pos: BugshopPosition): string => makeFen(pos.toSetup());
