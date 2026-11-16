import { opposite } from 'chessops';
import { type ShopRole, SHOP_ROLES, positionFromFen, positionToFen } from '@bugshop/rules';
import { type BotInput, type BotMove, COIN_VALUE, MAX_MATERIAL } from './engine';
import { type LevelSpec, LEVELS } from './levels';

// The two strongest bots are Fairy-Stockfish (GPL-3.0, https://github.com/fairy-stockfish),
// compiled to WebAssembly and served from our own origin under /fsf/. Bugshop is
// taught to it as a custom variant: crazyhouse, except that captured pieces do
// not go to the capturer's pocket. Pockets are only filled from the shop.
//
// Stockfish knows nothing about seeds, so the shop is handled here: besides the
// position as it is, each piece the bot could afford is searched as if it were
// already in the pocket, restricted to dropping that piece. A purchase is made
// only when its drop beats the best ordinary move by more than the seeds cost.

const ENGINE_DIR = '/fsf/';
const VARIANT = 'bugshop';
const VARIANT_INI = `[${VARIANT}:crazyhouse]\ncapturesToHand = false\n`;
const MATE_SCORE = 100_000;
/** A drop has to be this much better (in centipawns) than not buying before seeds are spent on it. */
const BUY_MARGIN = 20;

interface StockfishModule {
  postMessage(command: string): void;
  addMessageListener(listener: (line: string) => void): void;
  FS: { writeFile(path: string, data: string): void };
}
declare global {
  interface Window {
    Stockfish?: () => Promise<StockfishModule>;
  }
}

/** A tiny module using one SIMD instruction: valid only where WebAssembly SIMD exists. */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

/**
 * Whether this browser can run the engine: it needs shared memory for its
 * threads (only on cross-origin-isolated pages) and WebAssembly SIMD.
 */
export const stockfishSupported = (): boolean => {
  try {
    return (
      typeof SharedArrayBuffer === 'function' &&
      globalThis.crossOriginIsolated === true &&
      typeof WebAssembly === 'object' &&
      WebAssembly.validate(SIMD_PROBE)
    );
  } catch {
    return false;
  }
};

// ---------- pure helpers (tested) ----------

/** Score of a UCI `info` line from the side to move's point of view, in centipawns. */
export const parseScore = (info: string): number | undefined => {
  const m = / score (cp|mate) (-?\d+)/.exec(info);
  if (!m) return undefined;
  const n = Number(m[2]);
  if (m[1] === 'cp') return n;
  // "mate 0" is reported for the side that is already mated.
  return n > 0 ? MATE_SCORE - n : -MATE_SCORE - n;
};

/** UCI moves are untrusted text from the engine: accept only the shapes the rules engine understands. */
const UCI_MOVE = /^(?:[a-h][1-8][a-h][1-8][qrbn]?|[PNBRQ]@[a-h][1-8])$/;

export const parseBestMove = (line: string): string | undefined => {
  const move = /^bestmove (\S+)/.exec(line)?.[1];
  return move && UCI_MOVE.test(move) ? move : undefined;
};

export interface SearchResult {
  move: string | undefined;
  score: number;
}

export interface Purchase extends SearchResult {
  role: ShopRole;
  price: number;
}

/** Pick between the best ordinary move and the best buy-and-drop. */
export const decide = (base: SearchResult, purchases: Purchase[]): BotMove | undefined => {
  let best: BotMove | undefined = base.move ? { uci: base.move, score: base.score } : undefined;
  let bar = base.move ? base.score + BUY_MARGIN : -Infinity;
  for (const p of purchases) {
    if (!p.move) continue;
    const value = p.score - p.price * COIN_VALUE;
    if (value > bar) {
      bar = value;
      best = { uci: p.move, buy: p.role, score: value };
    }
  }
  return best;
};

const ROLE_LETTER: Record<ShopRole, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q' };
const SQUARE = (sq: number) => 'abcdefgh'[sq & 7]! + ((sq >> 3) + 1);

/** The searches to run for a turn: the position as it is, plus one per piece worth considering buying. */
export const plan = (input: BotInput): { fen: string; purchases: { role: ShopRole; price: number; fen: string; drops: string[] }[] } => {
  const root = positionFromFen(input.fen);
  // Fair play: the opponent's pocket is hidden information.
  const hidden = root.pockets![opposite(root.turn)];
  for (const role of SHOP_ROLES) hidden[role] = 0;

  const purchases = [];
  if (root.board.occupied.size() + root.pockets!.size() < MAX_MATERIAL) {
    for (const role of SHOP_ROLES) {
      const price = input.prices[role];
      if (price > input.coins || root.pockets![root.turn][role] > 0) continue;
      const bought = root.clone();
      bought.pockets![bought.turn][role]++;
      const drops: string[] = [];
      for (const sq of bought.dropDests()) {
        if (role === 'pawn' && (sq < 8 || sq >= 56)) continue;
        drops.push(`${ROLE_LETTER[role]}@${SQUARE(sq)}`);
      }
      if (drops.length > 0) purchases.push({ role, price, fen: positionToFen(bought), drops });
    }
  }
  return { fen: positionToFen(root), purchases };
};

// ---------- the engine itself ----------

class Engine {
  private readonly sf: StockfishModule;
  private readonly lines: string[] = [];
  private wake: (() => void) | undefined;
  private strength: string | undefined;

  constructor(sf: StockfishModule) {
    this.sf = sf;
    sf.addMessageListener(line => {
      this.lines.push(line);
      this.wake?.();
    });
  }

  private send(command: string) {
    this.sf.postMessage(command);
  }

  /** Collect output up to (and including) the first line matching `done`. */
  private async until(done: RegExp, timeoutMs: number): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.lines.findIndex(l => done.test(l));
      if (i >= 0) return this.lines.splice(0, i + 1);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('The engine did not answer in time.');
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, left);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.wake = undefined;
    }
  }

  async init() {
    this.send('uci');
    await this.until(/^uciok/, 15_000);
    // The engine reads variant definitions from a file; this one lives in its in-memory file system.
    this.sf.FS.writeFile('/bugshop.ini', VARIANT_INI);
    this.send('setoption name VariantPath value /bugshop.ini');
    this.send(`setoption name UCI_Variant value ${VARIANT}`);
    // No neural network exists for this variant: use the hand-written evaluation.
    this.send('setoption name Use NNUE value false');
    this.send('setoption name Threads value 1');
    this.send('setoption name Hash value 32');
    this.send('isready');
    const ready = await this.until(/^readyok/, 15_000);
    if (ready.some(l => /was not found/i.test(l))) throw new Error('The engine rejected the Bugshop variant.');
  }

  setStrength(spec: LevelSpec) {
    const key = String(spec.elo ?? 'full');
    if (key === this.strength) return;
    this.strength = key;
    if (typeof spec.elo === 'number') {
      this.send('setoption name UCI_LimitStrength value true');
      this.send(`setoption name UCI_Elo value ${spec.elo}`);
    } else {
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 20');
    }
  }

  async search(fen: string, timeMs: number, only?: string[]): Promise<SearchResult> {
    this.send(`position fen ${fen}`);
    this.send(`go movetime ${Math.round(timeMs)}${only ? ` searchmoves ${only.join(' ')}` : ''}`);
    const out = await this.until(/^bestmove/, timeMs + 8000);
    const move = parseBestMove(out[out.length - 1]!);
    let score: number | undefined;
    for (let i = out.length - 2; i >= 0 && score === undefined; i--) score = parseScore(out[i]!);
    return { move, score: score ?? 0 };
  }
}

let loading: Promise<Engine> | undefined;

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the engine.'));
    document.head.append(script);
  });

/** Download and start the engine (once). Call early, e.g. when a Stockfish level is picked. */
export const loadStockfish = (): Promise<Engine> => {
  loading ??= (async () => {
    if (!stockfishSupported()) throw new Error('This browser cannot run the engine.');
    if (!window.Stockfish) await loadScript(`${ENGINE_DIR}stockfish.js`);
    if (!window.Stockfish) throw new Error('Could not load the engine.');
    const engine = new Engine(await window.Stockfish());
    await engine.init();
    return engine;
  })();
  // A failed load may be retried later (a flaky connection, say).
  loading.catch(() => (loading = undefined));
  return loading;
};

// One search at a time: the engine holds a single position.
let queue: Promise<unknown> = Promise.resolve();

/** Stockfish's choice for this position: a move, possibly preceded by a purchase. Rejects if the engine can't run. */
export const stockfishMove = (input: BotInput): Promise<BotMove | undefined> => {
  const run = async () => {
    const spec = LEVELS[input.level];
    const engine = await loadStockfish();
    engine.setStrength(spec);
    const { fen, purchases } = plan(input);
    // Most of the time goes to the real position; the what-if searches share the rest.
    const base = await engine.search(fen, purchases.length > 0 ? spec.timeMs * 0.6 : spec.timeMs);
    const share = purchases.length > 0 ? Math.max(120, (spec.timeMs * 0.4) / purchases.length) : 0;
    const results: Purchase[] = [];
    for (const p of purchases) {
      const r = await engine.search(p.fen, share, p.drops);
      results.push({ ...r, role: p.role, price: p.price });
    }
    return decide(base, results);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
};
