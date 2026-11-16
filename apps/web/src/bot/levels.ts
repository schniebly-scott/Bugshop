/** How strong, how careful and how quick each bot is. */
export interface LevelSpec {
  id: BotLevel;
  name: string;
  /** One line for the picker. */
  blurb: string;
  /** Plies searched (the strongest level deepens until `timeMs` runs out). */
  depth: number;
  /** Follow captures past the search depth, so it doesn't stop mid-exchange. */
  quiescence: boolean;
  /** Random error added to each candidate's score, in centipawns. */
  noise: number;
  /** Chance of playing any legal move at all, ignoring the search. */
  blunder: number;
  /** Chance per move that it looks at the shop. */
  shopping: number;
  /** Thinking budget for the search itself, in ms. */
  timeMs: number;
  /** Move tempo relative to the human's own pace (1 = as slow as you). Slower bots hand you more seeds. */
  tempo: number;
  /** Buys Squish when the human has wandered off. */
  squishes: boolean;
  /**
   * Which engine plays: our own search (`engine.ts`), or Fairy-Stockfish
   * (`stockfish.ts`), which needs a browser with WebAssembly threads.
   */
  engine: 'builtin' | 'stockfish';
  /** Stockfish only: playing strength as an approximate Elo, or `null` for full strength. */
  elo?: number | null;
}

export const BOT_LEVELS = ['larva', 'beetle', 'mantis', 'hornet', 'scorpion', 'tarantula'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

export const LEVELS: Record<BotLevel, LevelSpec> = {
  larva: {
    id: 'larva',
    name: 'Larva',
    blurb: 'Just hatched. Wanders about, hangs pieces and takes its time.',
    depth: 1,
    quiescence: false,
    noise: 220,
    blunder: 0.2,
    shopping: 0.35,
    timeMs: 300,
    tempo: 1.4,
    squishes: false,
    engine: 'builtin',
  },
  beetle: {
    id: 'beetle',
    name: 'Beetle',
    blurb: 'Grabs what it can see, but misses your reply.',
    depth: 2,
    quiescence: false,
    noise: 70,
    blunder: 0.04,
    shopping: 0.7,
    timeMs: 600,
    tempo: 1.15,
    squishes: false,
    engine: 'builtin',
  },
  mantis: {
    id: 'mantis',
    name: 'Mantis',
    blurb: 'A patient hunter. Spots short tactics and shops sensibly.',
    depth: 3,
    quiescence: true,
    noise: 18,
    blunder: 0,
    shopping: 1,
    timeMs: 1200,
    tempo: 0.9,
    squishes: true,
    engine: 'builtin',
  },
  hornet: {
    id: 'hornet',
    name: 'Hornet',
    blurb: 'Fast and sharp. Calculates deeper and punishes loose pieces.',
    depth: 6,
    quiescence: true,
    noise: 0,
    blunder: 0,
    shopping: 1,
    timeMs: 1500,
    tempo: 0.6,
    squishes: true,
    engine: 'builtin',
  },
  scorpion: {
    id: 'scorpion',
    name: 'Scorpion',
    blurb: 'Stockfish, held back to strong club level. Rarely misses a tactic.',
    depth: 0,
    quiescence: true,
    noise: 0,
    blunder: 0,
    shopping: 1,
    timeMs: 700,
    tempo: 0.6,
    squishes: true,
    engine: 'stockfish',
    elo: 2000,
  },
  tarantula: {
    id: 'tarantula',
    name: 'Tarantula',
    blurb: 'Stockfish at full strength. For masters, and the very brave.',
    depth: 0,
    quiescence: true,
    noise: 0,
    blunder: 0,
    shopping: 1,
    timeMs: 1500,
    tempo: 0.5,
    squishes: true,
    engine: 'stockfish',
    elo: null,
  },
};

/** Levels played by our own search (they work in every browser, and in tests). */
export const BUILTIN_LEVELS = BOT_LEVELS.filter(id => LEVELS[id].engine === 'builtin');

export const isBotLevel = (v: unknown): v is BotLevel => BOT_LEVELS.includes(v as BotLevel);
