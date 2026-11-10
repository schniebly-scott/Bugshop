import { useState } from 'react';
import type { GameMode } from '@bugshop/protocol';
import { linkTo, navigate } from '../router';
import { startSession } from '../online/session';

export function HomePage() {
  const [busy, setBusy] = useState<GameMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (mode: GameMode) => {
    setBusy(mode);
    setError(null);
    const session = await startSession(mode);
    const v = session.getView();
    if (v.roomId) navigate(`/g/${v.roomId}`);
    else {
      setError(v.error ?? 'Could not start a game.');
      setBusy(null);
    }
  };

  return (
    <main className="home">
      <section className="hero">
        <h2>Chess where time is money</h2>
        <p>
          Your clock counts up. Every minute your opponent spends thinking earns you a seed. Spend seeds at the stump market on
          new pieces and drop them onto the board, bughouse style.
        </p>
      </section>

      <div className="mode-cards">
        <button type="button" className="mode-card" disabled={busy !== null} onClick={() => start('public')}>
          <strong>{busy === 'public' ? 'Finding a game…' : 'Play online'}</strong>
          <span>Get matched with the next player looking for a game.</span>
        </button>
        <button type="button" className="mode-card" disabled={busy !== null} onClick={() => start('private')}>
          <strong>{busy === 'private' ? 'Creating…' : 'Invite a friend'}</strong>
          <span>Create a private game and send the link.</span>
        </button>
        <a className="mode-card" href="/hotseat" onClick={linkTo('/hotseat')}>
          <strong>Hotseat</strong>
          <span>Two players, one device. Works offline.</span>
        </a>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
