import { useState } from 'react';
import type { GameMode, GameSettings } from '@bugshop/protocol';
import { linkTo, navigate } from '../router';
import { startSession } from '../online/session';
import { loadSettings, saveSettings } from '../game/settingsStore';
import { SettingsForm } from './SettingsForm';

export function HomePage() {
  const [busy, setBusy] = useState<GameMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

  const start = async (mode: GameMode) => {
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
          Your clock counts up, and the time your opponent spends thinking earns you seeds. Spend seeds at the stump market
          on new pieces and drop them onto the board, bughouse style.
        </p>
      </section>

      <SettingsForm value={settings} onChange={setSettings} />

      <div className="mode-cards">
        <button type="button" className="mode-card" disabled={busy !== null} onClick={() => start('public')}>
          <strong>{busy === 'public' ? 'Finding a game…' : 'Play online'}</strong>
          <span>Get matched with the next player who picked the same settings.</span>
        </button>
        <button type="button" className="mode-card" disabled={busy !== null} onClick={() => start('private')}>
          <strong>{busy === 'private' ? 'Creating…' : 'Invite a friend'}</strong>
          <span>Create a private game and send the link.</span>
        </button>
        <a
          className="mode-card"
          href="/hotseat"
          onClick={e => {
            saveSettings(settings); // hotseat starts with the settings chosen here
            linkTo('/hotseat')(e);
          }}
        >
          <strong>Hotseat</strong>
          <span>Two players, one device. Works offline.</span>
        </a>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
