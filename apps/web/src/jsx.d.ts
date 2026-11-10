import type { DetailedHTMLProps, HTMLAttributes } from 'react';

// chessground styles pieces as <piece class="white knight">; allow that element in JSX
// so pocket/shop icons reuse the same piece artwork as the board.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      piece: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
