import { useEffect, useState, type FormEvent } from 'react';
import type { GameSettings } from '@bugshop/protocol';
import { type AccountError, type SignInMethods, ACCOUNT_ERROR_TEXT, api } from '../account/api';
import { accountStore, useAccount } from '../account/store';
import { loadSettings, saveSettings } from '../game/settingsStore';
import { linkTo } from '../router';
import { AccountCard } from './Account';
import { CONTACT_EMAIL } from './LegalPages';
import { SettingsForm } from './SettingsForm';

/** Account and settings: profile, sign-in, default game settings, your data, and deleting the account. */
export function AccountPage() {
  const account = useAccount();
  const [deleted, setDeleted] = useState(false);

  if (deleted) {
    return (
      <main className="notice">
        <h2>Your account is deleted</h2>
        <p>Your account, player name, rating and sign-ins are gone. Thanks for playing Bugshop.</p>
        <a className="button primary" href="/" onClick={linkTo('/')}>
          Back to camp
        </a>
      </main>
    );
  }

  if (account.status !== 'ready' && account.status !== 'unnamed') {
    return (
      <main className="notice">
        <AccountCard reason="Sign in to see your account and settings." />
      </main>
    );
  }

  const player = account.status === 'ready' ? account.player : null;

  return (
    <main className="account-page">
      <h2 className="account-page-title">Your account</h2>

      <section className="account-section">
        <h3>Player</h3>
        {player ? (
          <dl className="account-facts">
            <dt>Name</dt>
            <dd>{player.name}</dd>
            <dt>Rating</dt>
            <dd>{player.rating}</dd>
            <dt>Games</dt>
            <dd>
              {player.games} played · {player.wins} won · {player.losses} lost · {player.draws} drawn
            </dd>
          </dl>
        ) : (
          <p>
            You haven't chosen a player name yet. <a href="/hotseat" onClick={linkTo('/hotseat')}>Choose one</a> to start
            playing.
          </p>
        )}
      </section>

      <section className="account-section">
        <h3>Sign-in</h3>
        <SignInSection email={account.email} />
      </section>

      <section className="account-section">
        <h3>Game settings</h3>
        <p className="hint">Your defaults for new games. You can still change them on the front page.</p>
        <DefaultSettings />
      </section>

      <section className="account-section">
        <h3>Your data</h3>
        <p>
          What we store and why is in the <a href="/privacy" onClick={linkTo('/privacy')}>Privacy Policy</a> and the{' '}
          <a href="/terms" onClick={linkTo('/terms')}>Terms of Service</a>. For a copy of your data or any other request,
          email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from {account.email}.
        </p>
      </section>

      <section className="account-section danger-zone">
        <h3>Delete account</h3>
        <DeleteAccount playerName={player?.name ?? null} onDeleted={() => setDeleted(true)} />
      </section>
    </main>
  );
}

/** Which sign-in methods the account has, loaded once per page view. */
const useSignInMethods = () => {
  const [methods, setMethods] = useState<SignInMethods | 'error' | undefined>();
  useEffect(() => {
    let live = true;
    void api.signInMethods().then(res => live && setMethods(res.ok ? res.value : 'error'));
    return () => {
      live = false;
    };
  }, []);
  return methods;
};

function SignInSection({ email }: { email: string }) {
  const methods = useSignInMethods();
  const list =
    methods && methods !== 'error'
      ? [methods.password && 'email and password', methods.google && 'Google', methods.apple && 'Apple'].filter(Boolean).join(', ')
      : null;
  return (
    <>
      <dl className="account-facts">
        <dt>Email</dt>
        <dd>{email}</dd>
        {list && (
          <>
            <dt>Signs in with</dt>
            <dd>{list}</dd>
          </>
        )}
      </dl>
      <button type="button" onClick={() => void accountStore.signOut()}>
        Sign out
      </button>
    </>
  );
}

function DefaultSettings() {
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <SettingsForm
        value={settings}
        onChange={s => {
          setSettings(s);
          saveSettings(s);
          setSaved(true);
        }}
      />
      <p className="hint" role="status" aria-live="polite">
        {saved ? 'Saved on this device.' : 'Saved on this device when you change them.'}
      </p>
    </>
  );
}

function DeleteAccount({ playerName, onDeleted }: { playerName: string | null; onDeleted(): void }) {
  const methods = useSignInMethods();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountError | null>(null);

  const confirmWord = playerName ?? 'DELETE';
  const needsPassword = methods !== undefined && methods !== 'error' && methods.password;
  const ready = confirm === confirmWord && (!needsPassword || password.length > 0) && methods !== undefined;

  if (!open) {
    return (
      <>
        <p>Delete your account and everything linked to it. This can't be undone.</p>
        <button type="button" className="danger" onClick={() => setOpen(true)}>
          Delete my account…
        </button>
      </>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await api.deleteAccount(needsPassword ? password : undefined);
    setBusy(false);
    if (res.ok) {
      accountStore.deleted();
      onDeleted();
    } else {
      setError(res.error);
      setPassword('');
    }
  };

  return (
    <form className="account-form delete-form" onSubmit={e => void submit(e)} noValidate>
      <p>Deleting your account permanently removes:</p>
      <ul>
        <li>your account, email address and password</li>
        <li>your player name{playerName ? ` (${playerName})` : ''}, which then becomes free for others to take</li>
        <li>your rating and game record</li>
        <li>your sign-ins on every device</li>
      </ul>
      <p className="hint">
        Games you played stay in your opponents' histories, but no longer show your name. Backups that still contain your
        account are deleted within 14 days.
      </p>

      {needsPassword && (
        <label>
          Your password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            maxLength={128}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </label>
      )}
      {methods !== undefined && !needsPassword && (
        <p className="hint">
          You sign in without a password, so you need to have signed in within the last day. If deleting is refused, sign
          out, sign back in, and try again.
        </p>
      )}

      <label>
        <span>
          Type <strong>{confirmWord}</strong> to confirm
        </span>
        <input
          type="text"
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
      </label>

      {error && (
        <p className="error" role="alert">
          {ACCOUNT_ERROR_TEXT[error]}
        </p>
      )}
      {error === 'reauth-required' && (
        <button type="button" onClick={() => void accountStore.signOut()}>
          Sign out to sign in again
        </button>
      )}

      <div className="delete-actions">
        <button type="submit" className="danger" disabled={!ready || busy}>
          {busy ? 'Deleting…' : 'Permanently delete my account'}
        </button>
        <button type="button" className="link" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
