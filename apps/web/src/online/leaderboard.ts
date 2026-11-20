import { type LeaderboardEntry, ApiPath, HANDLE_PATTERN, LEADERBOARD } from '@bugshop/protocol';
import { SERVER_URL } from './session';

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e7;

/** The reply comes over the network: keep only well-formed rows (names must be valid player names). */
export const parseLeaderboard = (data: unknown): LeaderboardEntry[] => {
  const players = (data as { players?: unknown } | null)?.players;
  if (!Array.isArray(players)) return [];
  return players
    .filter(
      (p): p is LeaderboardEntry =>
        !!p &&
        typeof p === 'object' &&
        typeof p.name === 'string' &&
        HANDLE_PATTERN.test(p.name) &&
        isCount(p.rank) &&
        isCount(p.rating) &&
        isCount(p.games),
    )
    .slice(0, LEADERBOARD.size)
    .map(({ rank, name, rating, games }) => ({ rank, name, rating, games }));
};

/** The top players, or `undefined` if the server can't be reached. Public: no cookie is sent. */
export const fetchLeaderboard = async (): Promise<LeaderboardEntry[] | undefined> => {
  try {
    const res = await fetch(`${SERVER_URL}${ApiPath.leaderboard}`, { credentials: 'omit' });
    return res.ok ? parseLeaderboard(await res.json()) : undefined;
  } catch {
    return undefined;
  }
};
