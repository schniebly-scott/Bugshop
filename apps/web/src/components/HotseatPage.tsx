import { useEffect, useState } from 'react';
import { opposite, type Color } from 'chessops';
import { turnOf } from '@bugshop/rules';
import { GameView } from './GameView';
import { ConfirmButton } from './ConfirmButton';
import { useHotseatGame } from '../game/useHotseatGame';
import { useNow } from '../game/useNow';
import { colorName, errorText, settingsText } from '../game/view';
import { loadSettings, saveSettings } from '../game/settingsStore';
import { SettingsForm } from './SettingsForm';

export function HotseatPage() {
  const [settings, setSettings] = useState(loadSettings);
  const { state, act, newGame, lastError, clearError } = useHotseatGame(settings);
  const startNew = () => {
    saveSettings(settings);
    newGame(settings);
  };
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
      revealed={['white', 'black']}
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
        <ConfirmButton onConfirm={startNew} confirmLabel="Abandon this game?">New game</ConfirmButton>
      ) : (
        <button type="button" className="primary" onClick={startNew}>New game</button>
      )}
      <p className="settings-summary">This game: {settingsText({ secondsPerCoin: state.config.msPerCoin / 1000, squishPrice: state.config.squishPrice })}</p>
      <details className="new-game-settings">
        <summary>Settings for the next game</summary>
        <SettingsForm value={settings} onChange={setSettings} />
      </details>
    </GameView>
  );
}
