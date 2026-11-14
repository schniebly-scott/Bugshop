import type { Color } from 'chessops';
import { type GameState, SHOP_ROLES, coinsAt, elapsed, pockets } from '@bugshop/rules';
import type { SeatStatus } from '@bugshop/protocol';
import { formatClock } from '../game/view';
import { BackpackIcon, SeedIcon } from './icons';
import { PieceIcon } from './PieceIcon';

/** Name, count-up clock and (when visible to this screen) seeds for one player. */
export function PlayerBar(props: {
  color: Color;
  label: string;
  state: GameState;
  now: number;
  /** Whether this screen may see the player's seeds and pocket. */
  revealed: boolean;
  seat?: SeatStatus;
  /** Show a compact view of their pocket in the bar (when their full backpack isn't shown). */
  showPocket?: boolean;
}) {
  const { color, state, now } = props;
  const opponent: Color = color === 'white' ? 'black' : 'white';
  const playing = state.status === 'playing';
  const toMove = playing && state.fen.split(' ')[1] === color[0];
  const time = elapsed(state, now);
  const coins = coinsAt(state, color, now);
  const progress = (time[opponent] % state.config.msPerCoin) / state.config.msPerCoin;

  return (
    <div className={`player-bar ${toMove ? 'to-move' : ''}`} aria-label={props.label}>
      <span className={`player-dot ${color}`} aria-hidden="true" />
      <span className="player-name">{props.label}</span>
      {props.seat && props.seat !== 'connected' && (
        <span className="presence">{props.seat === 'away' ? 'Away' : 'Not here yet'}</span>
      )}
      <span className="player-bar-spacer" />
      {props.revealed && props.showPocket && <MiniPocket counts={pockets(state)[color]} color={color} />}
      {props.revealed ? (
        <span
          className="seeds"
          aria-label={`${coins} ${coins === 1 ? 'seed' : 'seeds'}`}
          title={`Earns 1 seed for every ${state.config.msPerCoin / 1000}s the opponent spends thinking`}
        >
          <SeedIcon />
          <strong>{coins}</strong>
          <span className="seed-progress" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        </span>
      ) : (
        <span className="seeds hidden-info" aria-label="Seeds and backpack hidden" title="Their seeds and backpack stay secret until the game ends">
          <BackpackIcon />
          <strong>?</strong>
        </span>
      )}
      <time className="clock" aria-label={`${props.label} time used`}>
        {formatClock(time[color])}
      </time>
    </div>
  );
}

function MiniPocket({ counts, color }: { counts: Record<(typeof SHOP_ROLES)[number], number>; color: Color }) {
  const held = SHOP_ROLES.filter(r => counts[r] > 0);
  if (held.length === 0) return null;
  return (
    <span className="mini-pocket" title="Pieces in their backpack">
      <BackpackIcon />
      {held.map(r => (
        <span key={r} className="mini-piece">
          <PieceIcon color={color} role={r} />
          {counts[r] > 1 && <sub>{counts[r]}</sub>}
        </span>
      ))}
    </span>
  );
}
