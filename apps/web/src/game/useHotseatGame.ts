import { useCallback, useRef, useState } from 'react';
import type { Color } from 'chessops';
import { type Action, type GameState, type RuleError, applyAction, createGame } from '@bugshop/rules';

/**
 * Local two-player game state. The rules engine is pure, so hotseat mode just
 * feeds it actions with the local clock. Online play will send the same
 * actions to the server instead, which then decides.
 */
export const useHotseatGame = () => {
  const [state, setState] = useState<GameState>(() => createGame({ now: Date.now() }));
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

  const newGame = useCallback(() => {
    const fresh = createGame({ now: Date.now() });
    stateRef.current = fresh;
    setState(fresh);
    setLastError(null);
  }, []);

  return { state, act, newGame, lastError, clearError: () => setLastError(null) };
};
