import { useEffect, useState } from 'react';
import { type LeaderboardEntry, LEADERBOARD } from '@bugshop/protocol';
import { fetchLeaderboard } from '../online/leaderboard';
import { useAccount } from '../account/store';

type Load = { status: 'loading' } | { status: 'offline' } | { status: 'ready'; players: LeaderboardEntry[] };

/** Top players by rating. Public: anyone can look, signed in or not. */
export function LeaderboardPage() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const account = useAccount();
  const me = account.status === 'ready' ? account.player.name : undefined;

  useEffect(() => {
    let cancelled = false;
    void fetchLeaderboard().then(players => {
      if (!cancelled) setLoad(players ? { status: 'ready', players } : { status: 'offline' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="leaderboard-page">
      <section className="noticeboard leaderboard">
        <h2>Leaderboard</h2>
        <p className="leaderboard-intro">
          The top {LEADERBOARD.size} players by rating. Play a rated online game to get on the board.
        </p>
        {load.status === 'loading' && <p className="notice-empty">Reading the board…</p>}
        {load.status === 'offline' && <p className="notice-empty">Can't reach the game server right now.</p>}
        {load.status === 'ready' && load.players.length === 0 && (
          <p className="notice-empty">Nobody has played a rated game yet. Be the first!</p>
        )}
        {load.status === 'ready' && load.players.length > 0 && (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Rating</th>
                <th scope="col">Games</th>
              </tr>
            </thead>
            <tbody>
              {load.players.map(p => (
                <tr key={p.name} className={p.name === me ? 'me' : undefined} aria-current={p.name === me ? 'true' : undefined}>
                  <td className="rank">{p.rank}</td>
                  <td className="name">
                    {p.name}
                    {p.name === me && <span className="you-tag">you</span>}
                  </td>
                  <td>
                    <span className="rating">{p.rating}</span>
                  </td>
                  <td className="games">{p.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
