import { type GameSettings, DEFAULT_SETTINGS, isValidSettings } from '@bugshop/protocol';

// The player's last-used game settings: a per-browser convenience only.
// The stored value is untrusted (it could be edited), so it is re-validated on load.
const KEY = 'bugshop:settings';

export const loadSettings = (): GameSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
    const { secondsPerCoin, claimVictoryPrice } = parsed as Record<string, unknown>;
    const candidate = { secondsPerCoin, claimVictoryPrice } as GameSettings;
    return isValidSettings(candidate) ? candidate : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (s: GameSettings): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings just won't be remembered */
  }
};
