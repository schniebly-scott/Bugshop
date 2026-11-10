import { useEffect, useState } from 'react';
import { opposite, type Color } from 'chessops';
import { turnOf } from '@bugshop/rules';
import { GameView } from './GameView';
import { ConfirmButton } from './ConfirmButton';
import { useHotseatGame } from '../game/useHotseatGame';
import { useNow } from '../game/useNow';
import { colorName, errorText } from '../game/view';

export function HotseatPage() {
  const { state, act, newGame, lastError, clearError } = useHotseatGame();
  const playing = state.status === 'playing';
  const now = useNow(playing);

  const [autoFlip, setAutoFlip] = useState(true);
  const [manualOrientation, setManualOrientation] = useState<Color>('white');
  const orientation = autoFlip ? turnOf(state) : manualOrientation;

  useEffect(() => {
    if (!lastError) return;
    const id = setTimeout(clearError, 2500);
    return () => clearTimeout(id);
  }, [lastError]);

  return (
    <GameView
      state={state}
      now={now}
      controls={['white', 'black']}
      orientation={orientation}
      act={act}
      message={lastError && errorText(lastError)}
      label={colorName}
    >
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
    </GameView>
  );
}
