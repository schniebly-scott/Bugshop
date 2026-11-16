import { useCallback, useEffect, useRef, useState } from 'react';
import { type Color, opposite } from 'chessops';
import { type Action, type GameState, type RuleError, applyAction, coinsAt, createGame, turnOf } from '@bugshop/rules';
import { type GameSettings, settingsToConfig } from '@bugshop/protocol';
import { requestBotMove } from '../bot/client';
import { acceptsDraw } from '../bot/engine';
import { type BotLevel, LEVELS } from '../bot/levels';
import { shouldSquish, thinkTime } from '../bot/pace';

export interface BotGameSetup {
  level: BotLevel;
  human: Color;
  settings: GameSettings;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * A local game against the bot. Like hotseat, the pure rules engine runs in the
 * page with the local clock; the bot is just the other player, sending the same
 * actions through `applyAction` that a human would.
 */
export const useBotGame = (setup: BotGameSetup) => {
  const bot = opposite(setup.human);
  const spec = LEVELS[setup.level];
  const [state, setState] = useState<GameState>(() => createGame({ now: Date.now(), config: settingsToConfig(setup.settings) }));
  const [lastError, setLastError] = useState<RuleError | null>(null);
  // Mirror of `state` so actions validate against the latest position synchronously.
  const stateRef = useRef(state);

  const apply = useCallback((by: Color, action: Action): boolean => {
    const res = applyAction(stateRef.current, by, action, Date.now());
    if (!res.ok) return false;
    stateRef.current = res.state;
    setState(res.state);
    return true;
  }, []);

  /** The human's actions. The bot's side is not theirs to play. */
  const act = useCallback(
    (by: Color, action: Action): boolean => {
      if (by !== setup.human) return false;
      const res = applyAction(stateRef.current, by, action, Date.now());
      if (!res.ok) {
        setLastError(res.error);
        return false;
      }
      stateRef.current = res.state;
      setState(res.state);
      setLastError(null);
      return true;
    },
    [setup.human],
  );

  // The bot's turn: search in the worker, wait out its thinking time, then play.
  const botToMove = state.status === 'playing' && turnOf(state) === bot;
  useEffect(() => {
    if (!botToMove) return;
    let cancelled = false;
    const position = stateRef.current;
    const now = Date.now();
    const thinking = sleep(thinkTime(position, bot, spec, now, Math.random()));
    const search = requestBotMove({
      fen: position.fen,
      coins: coinsAt(position, bot, now),
      prices: position.config.prices,
      level: setup.level,
      positions: position.positions,
    });
    void Promise.all([search, thinking]).then(([move]) => {
      // The human may buy while the bot thinks, but the position on the board is still the one searched.
      if (cancelled || !move || stateRef.current.fen.split('[')[0] !== position.fen.split('[')[0]) return;
      if (move.buy && !apply(bot, { type: 'buy', role: move.buy })) return;
      apply(bot, { type: 'move', uci: move.uci });
    });
    return () => {
      cancelled = true;
    };
    // Re-run when the position to answer changes, not on every purchase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botToMove, state.history.filter(e => e.type === 'move').length]);

  // A draw offer gets an answer after a short pause.
  const offered = state.status === 'playing' && state.drawOffer === setup.human;
  useEffect(() => {
    if (!offered) return;
    const id = setTimeout(() => {
      const current = stateRef.current;
      if (current.drawOffer !== setup.human) return;
      apply(bot, { type: acceptsDraw(current.fen, bot) ? 'acceptDraw' : 'declineDraw' });
    }, 1200);
    return () => clearTimeout(id);
  }, [offered, apply, bot, setup.human]);

  // If the human walks away for a long time, the stronger bots end the game with Squish.
  const playing = state.status === 'playing';
  useEffect(() => {
    if (!playing || !spec.squishes) return;
    const id = setInterval(() => {
      if (shouldSquish(stateRef.current, bot, spec, Date.now())) apply(bot, { type: 'squish' });
    }, 5000);
    return () => clearInterval(id);
  }, [playing, spec, bot, apply]);

  return { state, act, lastError, clearError: () => setLastError(null) };
};
