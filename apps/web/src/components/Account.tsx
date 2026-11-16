import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { HANDLE_PATTERN, MIN_PASSWORD_LENGTH } from '@bugshop/protocol';
import { type AccountError, ACCOUNT_ERROR_TEXT, api } from '../account/api';
import { accountStore, useAccount, useProviders } from '../account/store';
import { linkTo, navigate } from '../router';
import { AppleIcon, GoogleIcon } from './icons';

/** Shows its children only to signed-in players with a name; everyone else gets the way in. */
export function AccountGate({ children, reason }: { children: ReactNode; reason?: string }) {
  const account = useAccount();
  if (account.status === 'ready') return <>{children}</>;
  return (
    <main className="notice">
      <AccountCard reason={reason} />
    </main>
  );
}

/** The sign-in / create-account / choose-name steps, whichever the visitor is at. */
export function AccountCard({ reason }: { reason?: string }) {
  const account = useAccount();
  if (account.status === 'loading') return <p className="connecting">Checking who's at the campfire…</p>;
  if (account.status === 'offline') {
    return (
      <>
        <h2>Can't reach the game server</h2>
        <p>You need to be signed in to play, and the server isn't answering right now.</p>
        <button type="button" className="primary" onClick={() => void accountStore.refresh()}>
          Try again
        </button>
      </>
    );
  }
  if (account.status === 'unnamed') return <NameForm />;
  if (account.status === 'ready') return null;
  return <SignInForm reason={reason} />;
}

function ErrorLine({ error }: { error: AccountError | null }) {
  return error ? (
    <p className="error" role="alert">
      {ACCOUNT_ERROR_TEXT[error]}
    </p>
  ) : null;
}

type Mode = 'sign-in' | 'sign-up' | 'forgot';

function SignInForm({ reason }: { reason?: string }) {
  const providers = useProviders();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountError | null>(null);
  /** Set once a mail is on its way: what it is for. */
  const [mailed, setMailed] = useState<'verify' | 'reset' | null>(null);

  // A failed Google/Apple round trip comes back with ?signin=failed.
  const [socialFailed, setSocialFailed] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('signin') || params.has('error')) {
      setSocialFailed(true);
      navigate(location.pathname, { replace: true });
    }
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSocialFailed(false);
    if (mode === 'forgot') {
      const res = await api.requestPasswordReset(email);
      if (res.ok) setMailed('reset');
      else setError(res.error);
    } else if (mode === 'sign-up') {
      const res = await api.signUp(email, password);
      if (!res.ok) setError(res.error);
      else if (providers?.emailVerification) setMailed('verify');
      else await accountStore.refresh();
    } else {
      const res = await api.signIn(email, password);
      if (res.ok) await accountStore.refresh();
      else if (res.error === 'email-not-verified') setMailed('verify');
      else setError(res.error);
    }
    setBusy(false);
  };

  const social = async (provider: 'google' | 'apple') => {
    setBusy(true);
    setError(null);
    const res = await api.socialUrl(provider);
    if (res.ok) location.assign(res.value);
    else {
      setError(res.error);
      setBusy(false);
    }
  };

  if (mailed) {
    return (
      <>
        <h2>Check your inbox</h2>
        <p>
          {mailed === 'verify'
            ? 'We sent a link to confirm your email. Open it on this device and you can start playing.'
            : 'If that address has an account, a link to choose a new password is on its way.'}
        </p>
        <p className="mailed-to">{email}</p>
        <div className="account-links">
          {mailed === 'verify' && (
            <ResendButton email={email} />
          )}
          <button type="button" className="link" onClick={() => { setMailed(null); setMode('sign-in'); }}>
            Back to sign in
          </button>
        </div>
      </>
    );
  }

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <>
      <h2>{mode === 'sign-up' ? 'Join the camp' : mode === 'forgot' ? 'Forgot your password?' : 'Sign in to play'}</h2>
      <p>
        {mode === 'forgot'
          ? "Enter your email and we'll send a link to choose a new one."
          : (reason ?? 'An account keeps your name and your rating. It takes a minute.')}
      </p>

      {mode !== 'forgot' && (providers?.google || providers?.apple) && (
        <>
          <div className="social-buttons">
            {providers.google && (
              <button type="button" className="social google" disabled={busy} onClick={() => void social('google')}>
                <GoogleIcon /> Continue with Google
              </button>
            )}
            {providers.apple && (
              <button type="button" className="social apple" disabled={busy} onClick={() => void social('apple')}>
                <AppleIcon /> Continue with Apple
              </button>
            )}
          </div>
          <p className="or-divider">or with email</p>
        </>
      )}

      <form className="account-form" onSubmit={e => void submit(e)} noValidate>
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              minLength={mode === 'sign-up' ? MIN_PASSWORD_LENGTH : undefined}
              maxLength={128}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {mode === 'sign-up' && <small>At least {MIN_PASSWORD_LENGTH} characters.</small>}
          </label>
        )}
        <ErrorLine error={error} />
        {socialFailed && !error && (
          <p className="error" role="alert">
            That sign-in didn't go through. Try again, or use your email.
          </p>
        )}
        <button type="submit" className="primary" disabled={busy || !email || (mode !== 'forgot' && !password)}>
          {busy ? 'One moment…' : mode === 'sign-up' ? 'Create account' : mode === 'forgot' ? 'Send the link' : 'Sign in'}
        </button>
      </form>

      <div className="account-links">
        {mode === 'sign-in' ? (
          <>
            <button type="button" className="link" onClick={() => switchTo('sign-up')}>
              New here? Create an account
            </button>
            <button type="button" className="link" onClick={() => switchTo('forgot')}>
              Forgot password?
            </button>
          </>
        ) : (
          <button type="button" className="link" onClick={() => switchTo('sign-in')}>
            {mode === 'sign-up' ? 'Already have an account? Sign in' : 'Back to sign in'}
          </button>
        )}
      </div>
    </>
  );
}

function ResendButton({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  return (
    <button
      type="button"
      className="link"
      disabled={state !== 'idle'}
      onClick={async () => {
        setState('sending');
        await api.resendVerification(email);
        setState('sent');
      }}
    >
      {state === 'sent' ? 'Sent again' : 'Send it again'}
    </button>
  );
}

/** First sign-in: pick the name other players will see. */
function NameForm() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountError | null>(null);
  const valid = HANDLE_PATTERN.test(name);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    const res = await api.chooseName(name);
    if (res.ok) accountStore.setAccount(res.value);
    else setError(res.error);
    setBusy(false);
  };

  return (
    <>
      <h2>Pick your trail name</h2>
      <p>This is what other players see next to your rating. Choose well: it can't be changed later.</p>
      <form className="account-form" onSubmit={e => void submit(e)} noValidate>
        <label>
          Player name
          <input
            type="text"
            name="handle"
            autoComplete="nickname"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={16}
            required
            value={name}
            onChange={e => {
              setName(e.target.value.trim());
              setError(null);
            }}
          />
          <small>3 to 16 letters, digits, - or _, starting with a letter.</small>
        </label>
        <ErrorLine error={error} />
        <button type="submit" className="primary" disabled={busy || !valid}>
          {busy ? 'One moment…' : 'Start playing'}
        </button>
      </form>
      <div className="account-links">
        <button type="button" className="link" onClick={() => void accountStore.signOut()}>
          Sign out
        </button>
      </div>
    </>
  );
}

/** Landing page of the password-reset link (`/reset-password?token=…`). */
export function ResetPasswordPage() {
  // Read the token once, then take it out of the address bar and history.
  const [token] = useState(() => new URLSearchParams(location.search).get('token') ?? '');
  const [linkBroken] = useState(() => new URLSearchParams(location.search).has('error') || !/^[\w-]{8,128}$/.test(token));
  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true });
  }, []);

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountError | null>(linkBroken ? 'link-expired' : null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await api.resetPassword(token, password);
    if (res.ok) setDone(true);
    else setError(res.error);
    setBusy(false);
  };

  return (
    <main className="notice">
      {done ? (
        <>
          <h2>Password changed</h2>
          <p>You can sign in with your new password now.</p>
          <a className="button primary" href="/" onClick={linkTo('/')}>
            Back to camp
          </a>
        </>
      ) : (
        <>
          <h2>Choose a new password</h2>
          <form className="account-form" onSubmit={e => void submit(e)} noValidate>
            <label>
              New password
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={128}
                required
                disabled={linkBroken}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <small>At least {MIN_PASSWORD_LENGTH} characters.</small>
            </label>
            <ErrorLine error={error} />
            <button type="submit" className="primary" disabled={busy || linkBroken || !password}>
              {busy ? 'One moment…' : 'Save password'}
            </button>
          </form>
          <div className="account-links">
            <a href="/" onClick={linkTo('/')}>
              Back to camp
            </a>
          </div>
        </>
      )}
    </main>
  );
}

/** Header corner: who is signed in, their rating, and the way out. */
export function AccountChip() {
  const account = useAccount();
  if (account.status === 'ready') {
    const { name, rating, wins, losses, draws } = account.player;
    return (
      <div className="account-chip" title={`${account.email} · ${wins} won, ${losses} lost, ${draws} drawn`}>
        <span className="account-name">{name}</span>
        <span className="rating" aria-label={`Rating ${rating}`}>
          {rating}
        </span>
        <button type="button" className="link" onClick={() => void accountStore.signOut()}>
          Sign out
        </button>
      </div>
    );
  }
  if (account.status === 'unnamed') {
    return (
      <div className="account-chip">
        <button type="button" className="link" onClick={() => void accountStore.signOut()}>
          Sign out
        </button>
      </div>
    );
  }
  return null;
}
