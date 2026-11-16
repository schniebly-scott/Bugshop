import { type BotInput, type BotMove, chooseMove } from './engine';

// Runs the search off the main thread, so the board and clocks stay smooth while the bot thinks.

export interface BotRequest {
  id: number;
  input: BotInput;
}
export interface BotReply {
  id: number;
  move: BotMove | undefined;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<BotRequest>) => void) | null;
  postMessage(reply: BotReply): void;
};

scope.onmessage = e => {
  const { id, input } = e.data;
  scope.postMessage({ id, move: chooseMove(input) });
};
