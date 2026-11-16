import { type BotInput, type BotMove, chooseMove } from './engine';
import type { BotReply, BotRequest } from './worker';

// Asks the bot for a move. The search runs in a Web Worker (same origin, so the
// CSP needs nothing extra); if workers are unavailable it runs right here instead.

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, (move: BotMove | undefined) => void>();

const start = (): Worker | null => {
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<BotReply>) => {
      waiting.get(e.data.id)?.(e.data.move);
      waiting.delete(e.data.id);
    };
    w.onerror = () => {
      // The worker failed to load or crashed: answer everything pending inline and stop using it.
      worker = null;
      w.terminate();
      const pending = [...waiting.values()];
      waiting.clear();
      pending.forEach(resolve => resolve(undefined));
    };
    return w;
  } catch {
    return null;
  }
};

/** The bot's choice for this position, or undefined if it has no legal continuation. */
export const requestBotMove = async (input: BotInput): Promise<BotMove | undefined> => {
  if (worker === undefined) worker = start();
  if (worker) {
    const w = worker;
    const move = await new Promise<BotMove | undefined>(resolve => {
      const id = nextId++;
      waiting.set(id, resolve);
      w.postMessage({ id, input } satisfies BotRequest);
    });
    if (move || worker) return move;
  }
  return chooseMove(input);
};
