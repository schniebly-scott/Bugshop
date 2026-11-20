import { useCallback, useRef, useState } from 'react';
import type { Color } from 'chessops';
import { type Action, type GameState, type RuleError, applyAction, createGame } from '@bugshop/rules';
import { type GameSettings, settingsToConfig } from '@bugshop/protocol';
import { type PauseClock, RUNNING, gameTime, isPaused, pauseAt, resumeAt } from './pauseClock';

/**
 * Local two-player game state. The rules engine is pure, so hotseat mode just
 * feeds it actions with the local clock. Online play will send the same
 * actions to the server instead, which then decides.
 *
 * The game runs on its own clock (pauseClock.ts), which stands still while paused.
 */
const newHotseatGame = (settings: GameSettings) => createGame({ now: Date.now(), config: settingsToConfig(settings) });

export const useHotseatGame = (initialSettings: GameSettings) => {
  const [state, setState] = useState<GameState>(() => newHotseatGame(initialSettings));
  const [lastError, setLastError] = useState<RuleError | null>(null);
  // Mirror of `state` so `act` can validate synchronously and report success.
  const stateRef = useRef(state);

  const pauseRef = useRef<PauseClock>(RUNNING);
  const [paused, setPaused] = useState(false);

  /** The game's clock: frozen while paused, and never counting paused time. */
  const gameNow = useCallback((real: number = Date.now()) => gameTime(pauseRef.current, real), []);

  const act = useCallback(
    (by: Color, action: Action): boolean => {
      if (isPaused(pauseRef.current)) return false; // nothing happens while paused
      const res = applyAction(stateRef.current, by, action, gameNow());
      if (!res.ok) {
        setLastError(res.error);
        return false;
      }
      stateRef.current = res.state;
      setState(res.state);
      setLastError(null);
      return true;
    },
    [gameNow],
  );

  const pause = useCallback(() => {
    if (isPaused(pauseRef.current) || stateRef.current.status !== 'playing') return;
    pauseRef.current = pauseAt(pauseRef.current, Date.now());
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!isPaused(pauseRef.current)) return;
    pauseRef.current = resumeAt(pauseRef.current, Date.now());
    setPaused(false);
  }, []);

  const newGame = useCallback((settings: GameSettings) => {
    // The new game starts on real time again.
    pauseRef.current = RUNNING;
    setPaused(false);
    const fresh = newHotseatGame(settings);
    stateRef.current = fresh;
    setState(fresh);
    setLastError(null);
  }, []);

  return { state, act, newGame, lastError, clearError: () => setLastError(null), paused, pause, resume, gameNow };
};
