import { useState } from 'react';
import type { GameMode, GameSettings, LobbyListing } from '@bugshop/protocol';
import { linkTo, navigate } from '../router';
import { startSession } from '../online/session';
import { useLobbyList } from '../online/lobbyList';
import { loadSettings, saveSettings } from '../game/settingsStore';
import { useNow } from '../game/useNow';
import { SettingsForm } from './SettingsForm';
import { ShoeIcon, SeedIcon } from './icons';

export function HomePage() {
  const [busy, setBusy] = useState<GameMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

  const open = async (mode: GameMode) => {
    setBusy(mode);
    setError(null);
    saveSettings(settings);
    const session = await startSession(mode, settings);
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
          Your clock counts up, and every moment your opponent spends thinking earns you seeds. Trade seeds at the Stump Market
          for new pieces, keep them in your backpack, and drop them onto the board, bughouse style. Opponent wandered off? Squish
          them.
        </p>
      </section>

      <div className="home-grid">
        <section className="start-panel">
          <h3>Start a game</h3>
          <SettingsForm value={settings} onChange={setSettings} />
          <div className="start-actions">
            <button type="button" className="big-button primary" disabled={busy !== null} onClick={() => open('public')}>
              {busy === 'public' ? 'Opening…' : 'Open a lobby'}
              <small>Listed for anyone to join</small>
            </button>
            <button type="button" className="big-button" disabled={busy !== null} onClick={() => open('private')}>
              {busy === 'private' ? 'Creating…' : 'Invite a friend'}
              <small>Private game, share the link</small>
            </button>
            <a
              className="big-button"
              href="/hotseat"
              onClick={e => {
                saveSettings(settings); // hotseat starts with the settings chosen here
                linkTo('/hotseat')(e);
              }}
            >
              Hotseat
              <small>Two players, one device</small>
            </a>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </section>

        <LobbyBoard />
      </div>
    </main>
  );
}

/** Noticeboard of open public lobbies, updated live. */
function LobbyBoard() {
  const list = useLobbyList();
  const now = useNow(true, 15_000);

  return (
    <section className="noticeboard" aria-label="Open lobbies">
      <h3>Open lobbies</h3>
      {list.status === 'connecting' && <p className="notice-empty">Checking the noticeboard…</p>}
      {list.status === 'offline' && <p className="notice-empty">Can't reach the game server right now. Hotseat still works.</p>}
      {list.status === 'live' && list.lobbies.length === 0 && (
        <p className="notice-empty">No open lobbies. Open one and it will show up here.</p>
      )}
      {list.status === 'live' && list.lobbies.length > 0 && (
        <ul className="lobby-list">
          {list.lobbies.map(l => (
            <LobbyNote key={l.roomId} lobby={l} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LobbyNote({ lobby, now }: { lobby: LobbyListing; now: number }) {
  const minutes = Math.max(0, Math.floor((now - lobby.createdAt) / 60_000));
  return (
    <li className="lobby-note">
      <span className="lobby-setting" title="Opponent time per seed">
        <SeedIcon /> 1 / {lobby.settings.secondsPerCoin}s
      </span>
      <span className="lobby-setting" title="Squish price">
        <ShoeIcon /> {lobby.settings.squishPrice}
      </span>
      <span className="lobby-age">{minutes < 1 ? 'just opened' : `open ${minutes} min`}</span>
      <a className="join-button" href={`/g/${lobby.roomId}`} onClick={linkTo(`/g/${lobby.roomId}`)}>
        Join
      </a>
    </li>
  );
}
