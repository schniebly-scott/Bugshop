import { describe, expect, it, vi } from 'vitest';
import { LEADERBOARD } from '@bugshop/protocol';

// lobbyList.ts imports the router, which subscribes to `popstate` on import.
vi.stubGlobal('window', { addEventListener: () => {} });
const { parseOnlineCount } = await import('../src/online/lobbyList');
const { parseLeaderboard } = await import('../src/online/leaderboard');

describe('parseOnlineCount', () => {
  it('accepts two small non-negative integers', () => {
    expect(parseOnlineCount({ online: 12, playing: 4 })).toEqual({ online: 12, playing: 4 });
    expect(parseOnlineCount({ online: 0, playing: 0 })).toEqual({ online: 0, playing: 0 });
  });

  it('rejects anything else', () => {
    for (const bad of [null, 'x', {}, { online: -1, playing: 0 }, { online: 1.5, playing: 0 }, { online: '3', playing: 1 }, { online: 2, playing: 3 }]) {
      expect(parseOnlineCount(bad)).toBeNull();
    }
  });

  it('drops extra fields', () => {
    expect(parseOnlineCount({ online: 3, playing: 2, names: ['Moth'] })).toEqual({ online: 3, playing: 2 });
  });
});

describe('parseLeaderboard', () => {
  const row = { rank: 1, name: 'Moth', rating: 1520, games: 3 };

  it('keeps well-formed rows, with only the expected fields', () => {
    expect(parseLeaderboard({ players: [{ ...row, email: 'x@y.z' }] })).toEqual([row]);
  });

  it('drops rows with invalid names or numbers', () => {
    const players = [
      row,
      { ...row, name: '<img src=x>' },
      { ...row, name: 'Wasp', rating: 'high' },
      { ...row, name: 'Ant', rank: -1 },
      { ...row, name: 'Bee', games: undefined },
      null,
    ];
    expect(parseLeaderboard({ players })).toEqual([row]);
  });

  it('returns nothing for a malformed reply, and caps the length', () => {
    expect(parseLeaderboard(null)).toEqual([]);
    expect(parseLeaderboard({ players: 'nope' })).toEqual([]);
    const many = Array.from({ length: LEADERBOARD.size + 10 }, (_, i) => ({ ...row, name: `Bug${i}` }));
    expect(parseLeaderboard({ players: many })).toHaveLength(LEADERBOARD.size);
  });
});
