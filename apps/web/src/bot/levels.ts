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
}

export const BOT_LEVELS = ['larva', 'beetle', 'mantis', 'hornet'] as const;
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
  },
};

export const isBotLevel = (v: unknown): v is BotLevel => BOT_LEVELS.includes(v as BotLevel);
