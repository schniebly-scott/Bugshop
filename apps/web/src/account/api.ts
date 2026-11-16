import {
  type AccountInfo,
  type AuthProviders,
  type ProfileError,
  ApiPath,
  HANDLE_PATTERN,
  MIN_PASSWORD_LENGTH,
} from '@bugshop/protocol';
import { SERVER_URL } from '../online/session';

// Thin client for the account API on the game server. The session lives in an
// httpOnly cookie set by the server, so nothing here ever holds a token: every
// call just sends the cookie along (`credentials: 'include'`).

/** What went wrong, in terms the UI has a sentence for. */
export type AccountError =
  | 'network'
  | 'invalid-credentials'
  | 'email-not-verified'
  | 'weak-password'
  | 'invalid-email'
  | 'invalid-name'
  | 'name-taken'
  | 'link-expired'
  | 'slow-down'
  | 'unknown';

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: AccountError };

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: AccountError): Result<never> => ({ ok: false, error });

const call = async (path: string, body?: unknown): Promise<Response | undefined> => {
  try {
    return await fetch(`${SERVER_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return undefined;
  }
};

/** Server replies are untrusted input: read only the fields we expect, with the types we expect. */
const readJson = async (res: Response): Promise<Record<string, unknown>> => {
  try {
    const data: unknown = await res.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const parseAccount = (data: Record<string, unknown>): AccountInfo | undefined => {
  if (typeof data.email !== 'string') return undefined;
  const p = data.player;
  if (!p || typeof p !== 'object') return { email: data.email, player: null };
  const r = p as Record<string, unknown>;
  if (typeof r.name !== 'string' || !HANDLE_PATTERN.test(r.name)) return { email: data.email, player: null };
  return {
    email: data.email,
    player: { name: r.name, rating: num(r.rating), games: num(r.games), wins: num(r.wins), losses: num(r.losses), draws: num(r.draws) },
  };
};

/** Map an auth API failure to one of our errors. */
const authError = async (res: Response): Promise<AccountError> => {
  if (res.status === 429) return 'slow-down';
  const code = String((await readJson(res)).code ?? '');
  if (code === 'EMAIL_NOT_VERIFIED') return 'email-not-verified';
  if (/PASSWORD_TOO_(SHORT|LONG)/.test(code)) return 'weak-password';
  if (code === 'INVALID_EMAIL') return 'invalid-email';
  if (code === 'INVALID_TOKEN') return 'link-expired';
  if (res.status === 401 || /INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD/.test(code)) return 'invalid-credentials';
  return 'unknown';
};

const auth = async (path: string, body: unknown): Promise<Result> => {
  const res = await call(`${ApiPath.auth}${path}`, body);
  if (!res) return fail('network');
  return res.ok ? ok(undefined) : fail(await authError(res));
};

/** Where sign-in links and redirects should bring the visitor back to: this page, without its query. */
export const returnUrl = (): string => `${location.origin}${location.pathname}`;

export const api = {
  /** The signed-in account, `null` when signed out, `undefined` when the server can't be reached. */
  async me(): Promise<AccountInfo | null | undefined> {
    const res = await call(ApiPath.me);
    if (!res) return undefined;
    if (res.status === 401) return null;
    if (!res.ok) return undefined;
    return parseAccount(await readJson(res)) ?? null;
  },

  async providers(): Promise<AuthProviders> {
    const res = await call(ApiPath.providers);
    const data = res?.ok ? await readJson(res) : {};
    return { google: data.google === true, apple: data.apple === true, emailVerification: data.emailVerification === true };
  },

  signIn: (email: string, password: string) => auth('/sign-in/email', { email, password }),

  signUp(email: string, password: string): Promise<Result> {
    if (password.length < MIN_PASSWORD_LENGTH) return Promise.resolve(fail('weak-password'));
    // `name` is required by the auth API; the public player name is chosen separately.
    return auth('/sign-up/email', { name: 'Player', email, password, callbackURL: returnUrl() });
  },

  resendVerification: (email: string) => auth('/send-verification-email', { email, callbackURL: returnUrl() }),

  requestPasswordReset: (email: string) =>
    auth('/request-password-reset', { email, redirectTo: `${location.origin}/reset-password` }),

  resetPassword(token: string, newPassword: string): Promise<Result> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) return Promise.resolve(fail('weak-password'));
    return auth('/reset-password', { token, newPassword });
  },

  signOut: () => auth('/sign-out', {}),

  /** Start Google or Apple sign-in: resolves to the provider's page to send the browser to. */
  async socialUrl(provider: 'google' | 'apple'): Promise<Result<string>> {
    const here = returnUrl();
    const res = await call(`${ApiPath.auth}/sign-in/social`, { provider, callbackURL: here, errorCallbackURL: `${here}?signin=failed` });
    if (!res) return fail('network');
    if (!res.ok) return fail(await authError(res));
    const { url } = await readJson(res);
    // Only ever navigate to an https page (never `javascript:` or the like).
    try {
      if (typeof url === 'string' && new URL(url).protocol === 'https:') return ok(url);
    } catch {
      /* fall through */
    }
    return fail('unknown');
  },

  async chooseName(handle: string): Promise<Result<AccountInfo>> {
    if (!HANDLE_PATTERN.test(handle)) return fail('invalid-name');
    const res = await call(ApiPath.profile, { handle });
    if (!res) return fail('network');
    const data = await readJson(res);
    if (res.ok) {
      const account = parseAccount(data);
      return account ? ok(account) : fail('unknown');
    }
    if (res.status === 429) return fail('slow-down');
    const error = data.error as ProfileError | undefined;
    return fail(error === 'taken' ? 'name-taken' : error === 'invalid' ? 'invalid-name' : 'unknown');
  },
};

export const ACCOUNT_ERROR_TEXT: Record<AccountError, string> = {
  network: "Can't reach the game server. Check your connection and try again.",
  'invalid-credentials': "That email and password don't match an account.",
  'email-not-verified': 'Confirm your email first: open the link we sent you.',
  'weak-password': `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  'invalid-email': "That doesn't look like an email address.",
  'invalid-name': 'Names are 3 to 16 letters, digits, - or _, starting with a letter.',
  'name-taken': 'Someone already has that name. Try another.',
  'link-expired': 'This link has expired or was already used. Ask for a new one.',
  'slow-down': 'Too many attempts. Wait a minute and try again.',
  unknown: 'Something went wrong. Try again.',
};
