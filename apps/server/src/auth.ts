import type { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { MIN_PASSWORD_LENGTH } from '@bugshop/protocol';
import { getMigrations } from 'better-auth/db/migration';
import { type Env, DEV_AUTH_SECRET } from './env.ts';
import type { Mailer } from './mail.ts';

/**
 * Accounts and sessions (Better Auth): email + password, plus Google and Apple
 * sign-in when their credentials are configured. Sessions are httpOnly cookies,
 * so page scripts never see a token.
 */
export const createAuth = (
  env: Env,
  db: DatabaseSync,
  mailer: Mailer | undefined,
  /** Removes the account's own Bugshop data; runs before the account itself is deleted. */
  onDeleteAccount: (userId: string) => void = () => {},
) => {
  const baseURL = env.PUBLIC_URL ?? `http://localhost:${env.PORT}`;
  const send = (to: string, subject: string, lines: string[]) => {
    const text = [...lines, '', "If this wasn't you, ignore this email and nothing changes.", '', 'Bugshop'].join('\n');
    if (mailer) return mailer({ to, subject, text });
    // Development without a mail provider: show the mail in the server log instead.
    if (env.NODE_ENV === 'development') console.log(`\n[mail not sent: no RESEND_API_KEY]\n${subject}\n${text}\n`);
    return Promise.resolve();
  };

  const options = {
    appName: 'Bugshop',
    baseURL,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET ?? DEV_AUTH_SECRET,
    database: db,
    // Only the web app may call the auth API from a browser, and only its URLs
    // are accepted as redirect targets. Apple posts its sign-in result back.
    trustedOrigins: [...env.ALLOWED_ORIGINS, ...(env.APPLE_CLIENT_ID ? ['https://appleid.apple.com'] : [])],
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      // With a mail provider, an address must be confirmed before it can sign in.
      requireEmailVerification: !!mailer,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        await send(user.email, 'Reset your Bugshop password', [
          'Someone asked to reset the password for your Bugshop account.',
          'Choose a new one here (the link works for one hour):',
          '',
          url,
        ]);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        await send(user.email, 'Confirm your email for Bugshop', [
          'Welcome to Bugshop! Confirm your email address to start playing:',
          '',
          url,
        ]);
      },
    },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {}),
      ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
        ? { apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET } }
        : {}),
    },
    user: {
      // "Delete my account" (POST /api/auth/delete-user). The caller must prove it's
      // them: the account password, or a sign-in less than a day old (Google/Apple
      // accounts, which have no password). Sessions and linked sign-ins are removed
      // by the library; the player profile and game links are removed here first.
      deleteUser: {
        enabled: true,
        beforeDelete: async (user: { id: string }) => onDeleteAccount(user.id),
      },
    },
    account: {
      // Google and Apple confirm the address themselves, so signing in with
      // either joins the account that already uses that email.
      accountLinking: { enabled: true, trustedProviders: ['google', 'apple'] },
    },
    rateLimit: { enabled: env.NODE_ENV === 'production' },
    advanced: {
      // Spelled out because the library switches both off by default when
      // NODE_ENV is "test": the tests should see what production does.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: baseURL.startsWith('https://'),
      // Caddy sets X-Real-IP from the real connection (deploy/Caddyfile).
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
  };

  // Created by init(), after the tables exist (Better Auth checks them on first use).
  const start = () => betterAuth(options);
  let auth: ReturnType<typeof start> | undefined;
  const ready = () => {
    if (!auth) throw new Error('Auth is not initialised yet.');
    return auth;
  };

  return {
    /** Create or update Better Auth's tables, then start it. Runs once, before the server listens. */
    async init() {
      const { runMigrations } = await getMigrations(options);
      await runMigrations();
      auth = start();
    },
    handler: (request: Request) => ready().handler(request),
    /** The signed-in user for these request headers (reads the session cookie), or null. */
    async userFor(headers: Headers): Promise<{ id: string; email: string } | null> {
      const session = await ready().api.getSession({ headers });
      return session ? { id: session.user.id, email: session.user.email } : null;
    },
    providers: { google: !!env.GOOGLE_CLIENT_ID, apple: !!env.APPLE_CLIENT_ID, emailVerification: !!mailer },
  };
};

export type Auth = ReturnType<typeof createAuth>;
