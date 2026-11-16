import { type BotLevel, isBotLevel } from '../bot/levels';

export type ColorChoice = 'white' | 'black' | 'random';

export interface BotPrefs {
  level: BotLevel;
  color: ColorChoice;
}

const KEY = 'bugshop:bot';
const DEFAULTS: BotPrefs = { level: 'beetle', color: 'white' };

/** Last-used bot options. localStorage is untrusted: anything unexpected falls back to the defaults. */
export const loadBotPrefs = (): BotPrefs => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULTS;
    const { level, color } = raw as Record<string, unknown>;
    return {
      level: isBotLevel(level) ? level : DEFAULTS.level,
      color: color === 'white' || color === 'black' || color === 'random' ? color : DEFAULTS.color,
    };
  } catch {
    return DEFAULTS;
  }
};

export const saveBotPrefs = (prefs: BotPrefs): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode: just don't remember */
  }
};
