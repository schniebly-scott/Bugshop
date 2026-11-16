import { useState } from 'react';
import type { GameMode, GameSettings, LobbyListing } from '@bugshop/protocol';
import { linkTo, navigate } from '../router';
import { startSession } from '../online/session';
import { useLobbyList } from '../online/lobbyList';
import { loadSettings, saveSettings } from '../game/settingsStore';
import { useNow } from '../game/useNow';
import { SettingsForm } from './SettingsForm';
import { AccountCard } from './Account';
import { useAccount } from '../account/store';
import { parseDonateUrl } from '../support';
import { BackpackIcon, CampfireIcon, HourglassIcon, ScrollIcon, ShoeIcon, SeedIcon } from './icons';

export function HomePage() {
  const [busy, setBusy] = useState<GameMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const account = useAccount();

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
        <p>Your opponent's thinking time fills your purse. Spend it on reinforcements.</p>
      </section>

      <ol className="how">
        <li>
          <HourglassIcon />
          <strong>Earn seeds</strong>
          <span>Clocks count up. Every {settings.secondsPerCoin} seconds your opponent thinks earns you a seed.</span>
        </li>
        <li>
          <ScrollIcon />
          <strong>Shop the market</strong>
          <span>Trade seeds for pieces at the Stump Market, even on their turn.</span>
        </li>
        <li>
          <BackpackIcon />
          <strong>Unpack a surprise</strong>
          <span>Your backpack is secret. Drop a piece from it onto the board as your move.</span>
        </li>
      </ol>

      <div className="home-grid">
        {account.status === 'ready' ? (
          <section className="start-panel">
            <h3>Start a game</h3>
            <SettingsForm value={settings} onChange={setSettings} />
            <div className="start-actions">
              <button type="button" className="big-button primary" disabled={busy !== null} onClick={() => open('public')}>
                {busy === 'public' ? 'Opening…' : 'Open a lobby'}
                <small>Anyone can join from the noticeboard</small>
              </button>
              <button type="button" className="big-button" disabled={busy !== null} onClick={() => open('private')}>
                {busy === 'private' ? 'Creating…' : 'Invite a friend'}
                <small>Private game by invite link</small>
              </button>
              <a
                className="big-button"
                href="/hotseat"
                onClick={e => {
                  saveSettings(settings); // hotseat starts with the settings chosen here
                  linkTo('/hotseat')(e);
                }}
              >
                Pass and play
                <small>Two players on this device</small>
              </a>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
          </section>
        ) : (
          <section className="start-panel sign-in-panel">
            <AccountCard />
          </section>
        )}

        <LobbyBoard />
      </div>

      <TipJar />
    </main>
  );
}

const DONATE_URL = parseDonateUrl(import.meta.env.VITE_DONATE_URL);

/** Donation spot: the site is free, the server is not. Hidden until a donation link is configured. */
function TipJar() {
  if (!DONATE_URL) return null;
  return (
    <aside className="tip-jar" aria-label="Support Bugshop">
      <CampfireIcon />
      <div className="tip-jar-text">
        <h3>Keep the campfire burning</h3>
        <p>
          Bugshop is free, with no ads and nothing to buy but knights. The server, sadly, does not accept seeds. If you're
          having fun, toss a log on the fire and it stays lit for everyone.
        </p>
      </div>
      <a className="button primary" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
        Toss a log on the fire
      </a>
    </aside>
  );
}

/** Noticeboard of open public lobbies, updated live. */
function LobbyBoard() {
  const list = useLobbyList();
  const now = useNow(true, 15_000);

  return (
    <section className="noticeboard" aria-label="Open lobbies">
      <h3>Open lobbies</h3>
      {list.status === 'connecting' && <p className="notice-empty">Reading the noticeboard…</p>}
      {list.status === 'offline' && (
        <p className="notice-empty">Can't reach the game server right now. Pass and play still works.</p>
      )}
      {list.status === 'live' && list.lobbies.length === 0 && (
        <p className="notice-empty">Nobody is waiting right now. Open a lobby and it gets pinned here.</p>
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
      <span className="lobby-host">
        {lobby.host.name} <span className="rating">{lobby.host.rating}</span>
      </span>
      <span className="lobby-rules">
        <span>
          <SeedIcon /> 1 seed per {lobby.settings.secondsPerCoin}s
        </span>
        <span>
          <ShoeIcon /> Squish for {lobby.settings.squishPrice}
        </span>
      </span>
      <span className="lobby-age">{minutes < 1 ? 'Just opened' : `Waiting ${minutes} min`}</span>
      <a className="join-button" href={`/g/${lobby.roomId}`} onClick={linkTo(`/g/${lobby.roomId}`)}>
        Join
      </a>
    </li>
  );
}
