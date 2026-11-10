import { useCallback, useRef, useState } from 'react';
import type { Color } from 'chessops';
import { type Action, type GameState, type RuleError, applyAction, createGame } from '@bugshop/rules';
import { type GameSettings, settingsToConfig } from '@bugshop/protocol';

/**
 * Local two-player game state. The rules engine is pure, so hotseat mode just
 * feeds it actions with the local clock. Online play will send the same
 * actions to the server instead, which then decides.
 */
const newHotseatGame = (settings: GameSettings) => createGame({ now: Date.now(), config: settingsToConfig(settings) });

export const useHotseatGame = (initialSettings: GameSettings) => {
  const [state, setState] = useState<GameState>(() => newHotseatGame(initialSettings));
  const [lastError, setLastError] = useState<RuleError | null>(null);
  // Mirror of `state` so `act` can validate synchronously and report success.
  const stateRef = useRef(state);

  const act = useCallback((by: Color, action: Action): boolean => {
    const res = applyAction(stateRef.current, by, action, Date.now());
    if (!res.ok) {
      setLastError(res.error);
      return false;
    }
    stateRef.current = res.state;
    setState(res.state);
    setLastError(null);
    return true;
  }, []);

  const newGame = useCallback((settings: GameSettings) => {
    const fresh = newHotseatGame(settings);
    stateRef.current = fresh;
    setState(fresh);
    setLastError(null);
  }, []);

  return { state, act, newGame, lastError, clearError: () => setLastError(null) };
};
