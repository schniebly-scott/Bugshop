import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AuthProviders, ApiPath } from '@bugshop/protocol';
import { createGameServer } from '../src/app.ts';
import { loadEnv } from '../src/env.ts';
import type { Mail } from '../src/mail.ts';
import { cookiesOf, postJson } from './helpers.ts';

// A server with a mail provider: addresses must be confirmed, passwords can be reset.

const PORT = 35000 + Math.floor(Math.random() * 2000);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const WEB = 'http://localhost:5173';
const AUTH = `${ENDPOINT}${ApiPath.auth}`;
const outbox: Mail[] = [];
let server: ReturnType<typeof createGameServer>;

beforeAll(async () => {
  server = createGameServer(
    loadEnv({
      NODE_ENV: 'test',
      ALLOWED_ORIGINS: WEB,
      DATABASE_PATH: ':memory:',
      PUBLIC_URL: ENDPOINT,
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
    }),
    { mailer: async mail => void outbox.push(mail) },
  );
  await server.listen(PORT, '127.0.0.1');
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const linkIn = (mail: Mail) => mail.text.split('\n').find(l => l.startsWith('http'))!;
const mailTo = async (to: string, subject: RegExp) => {
  for (let i = 0; i < 200; i++) {
    const m = outbox.find(x => x.to === to && subject.test(x.subject));
    if (m) return m;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error(`no mail to ${to}`);
};
const signIn = (email: string, password: string) => postJson(`${AUTH}/sign-in/email`, { email, password }, { Origin: WEB });
const signedIn = async (cookie: string) => (await fetch(`${ENDPOINT}${ApiPath.me}`, { headers: { Cookie: cookie } })).status === 200;

describe('email verification', () => {
  const email = 'larva@test.example';
  const password = 'correct horse battery';

  it('does not sign in until the address is confirmed', async () => {
    const signUp = await postJson(`${AUTH}/sign-up/email`, { name: 'x', email, password, callbackURL: `${WEB}/` }, { Origin: WEB });
    expect(signUp.status).toBe(200);
    expect(await signedIn(cookiesOf(signUp))).toBe(false);
    expect((await signIn(email, password)).status).toBe(403);

    const mail = await mailTo(email, /confirm/i);
    const link = linkIn(mail);
    expect(link.startsWith(`${AUTH}/verify-email?`)).toBe(true);

    // Opening the link confirms the address, signs in, and sends the browser back to the web app.
    const verified = await fetch(link, { redirect: 'manual' });
    expect(verified.status).toBe(302);
    expect(verified.headers.get('location')).toBe(`${WEB}/`);
    expect(await signedIn(cookiesOf(verified))).toBe(true);
    expect((await signIn(email, password)).status).toBe(200);
  });

  it('only redirects to the web app after verifying', async () => {
    const res = await postJson(
      `${AUTH}/sign-up/email`,
      { name: 'x', email: 'phish@test.example', password, callbackURL: 'https://evil.example/' },
      { Origin: WEB },
    );
    expect(res.status).toBe(403);
  });

  it('resets a forgotten password and signs out old sessions', async () => {
    const old = cookiesOf(await signIn(email, password));
    expect(await signedIn(old)).toBe(true);

    const asked = await postJson(`${AUTH}/request-password-reset`, { email, redirectTo: `${WEB}/reset-password` }, { Origin: WEB });
    expect(asked.status).toBe(200);
    const link = linkIn(await mailTo(email, /reset/i));
    const landing = await fetch(link, { redirect: 'manual' });
    const target = new URL(landing.headers.get('location')!);
    expect(target.origin + target.pathname).toBe(`${WEB}/reset-password`);
    const token = target.searchParams.get('token')!;

    expect((await postJson(`${AUTH}/reset-password`, { newPassword: 'short', token }, { Origin: WEB })).status).toBe(400);
    expect((await postJson(`${AUTH}/reset-password`, { newPassword: 'a brand new password', token }, { Origin: WEB })).status).toBe(200);
    expect((await signIn(email, password)).status).toBe(401);
    expect((await signIn(email, 'a brand new password')).status).toBe(200);
    expect(await signedIn(old)).toBe(false);
    // The link works once.
    expect((await postJson(`${AUTH}/reset-password`, { newPassword: 'yet another password', token }, { Origin: WEB })).status).toBe(400);
  });

  it('answers the same for unknown addresses, so emails cannot be probed', async () => {
    const res = await postJson(`${AUTH}/request-password-reset`, { email: 'nobody@test.example', redirectTo: `${WEB}/reset-password` }, { Origin: WEB });
    expect(res.status).toBe(200);
    expect(outbox.some(m => m.to === 'nobody@test.example')).toBe(false);
  });
});

describe('social sign-in', () => {
  it('reports configured providers and starts the Google flow with a redirect back to this server', async () => {
    const providers = (await (await fetch(`${ENDPOINT}${ApiPath.providers}`)).json()) as AuthProviders;
    expect(providers).toEqual({ google: true, apple: false, emailVerification: true });

    const res = await postJson(`${AUTH}/sign-in/social`, { provider: 'google', callbackURL: `${WEB}/` }, { Origin: WEB });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const google = new URL(url);
    expect(google.origin).toBe('https://accounts.google.com');
    expect(google.searchParams.get('client_id')).toBe('google-id');
    expect(google.searchParams.get('redirect_uri')).toBe(`${AUTH}/callback/google`);
  });

  it('refuses a provider that is not configured, and foreign websites', async () => {
    expect((await postJson(`${AUTH}/sign-in/social`, { provider: 'apple', callbackURL: `${WEB}/` }, { Origin: WEB })).ok).toBe(false);
    const foreign = await postJson(`${AUTH}/sign-in/social`, { provider: 'google', callbackURL: 'https://evil.example/' }, { Origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
  });
});
