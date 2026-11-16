import { Client } from '@colyseus/sdk';
import { ApiPath } from '@bugshop/protocol';

/** The session cookie(s) from a response, ready to send back in a `Cookie` header. */
export const cookiesOf = (res: Response): string =>
  res.headers
    .getSetCookie()
    .map(c => c.split(';')[0]!)
    .filter(c => !c.endsWith('='))
    .join('; ');

/** The web app's origin in tests. Browsers send it with every POST; the auth API insists on it. */
export const WEB_ORIGIN = 'http://localhost:5173';

export const postJson = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB_ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

export interface TestAccount {
  handle: string;
  email: string;
  cookie: string;
}

/**
 * Register an account and give it a player name. Only works on a server without
 * a mailer (sign-up then signs in at once, with no address to confirm).
 */
export const createAccount = async (endpoint: string, handle: string): Promise<TestAccount> => {
  const email = `${handle.toLowerCase()}@test.example`;
  const signUp = await postJson(`${endpoint}${ApiPath.auth}/sign-up/email`, { name: handle, email, password: 'correct horse battery' });
  if (!signUp.ok) throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`);
  const cookie = cookiesOf(signUp);
  const profile = await postJson(`${endpoint}${ApiPath.profile}`, { handle }, { Cookie: cookie });
  if (!profile.ok) throw new Error(`profile failed: ${profile.status} ${await profile.text()}`);
  return { handle, email, cookie };
};

/** A game client signed in as `account` (or as nobody). */
export const clientFor = (endpoint: string, account?: TestAccount) =>
  new Client(endpoint, account ? { headers: { Cookie: account.cookie } } : undefined);
