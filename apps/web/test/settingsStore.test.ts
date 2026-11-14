import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@bugshop/protocol';
import { loadSettings, saveSettings } from '../src/game/settingsStore';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

describe('settingsStore', () => {
  beforeEach(() => store.clear());

  it('round-trips valid settings', () => {
    saveSettings({ secondsPerCoin: 25, squishPrice: 20 });
    expect(loadSettings()).toEqual({ secondsPerCoin: 25, squishPrice: 20 });
  });

  it('falls back to defaults for missing, corrupt or non-preset values', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    for (const raw of ['not json', 'null', '[]', '{"secondsPerCoin":0,"squishPrice":30}', '{"secondsPerCoin":"60","squishPrice":30}', '{"secondsPerCoin":1e9,"squishPrice":30}', '{"secondsPerCoin":15,"squishPrice":30}', '{"secondsPerCoin":60,"squishPrice":5}']) {
      store.set('bugshop:settings', raw);
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('drops unknown extra fields', () => {
    store.set('bugshop:settings', '{"secondsPerCoin":45,"squishPrice":10,"__proto__":{"x":1},"evil":true}');
    expect(loadSettings()).toEqual({ secondsPerCoin: 45, squishPrice: 10 });
  });
});
