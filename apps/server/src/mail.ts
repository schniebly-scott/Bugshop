import type { Env } from './env.ts';

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. Links go on their own line so every mail client makes them clickable. */
  text: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

/**
 * Sends account mail (verify address, reset password) through Resend's HTTP API.
 * Returns undefined when no API key is configured: then email addresses can't be
 * verified, which is only allowed outside production (see env.ts).
 */
export const createMailer = (env: Env): Mailer | undefined => {
  const { RESEND_API_KEY: key, MAIL_FROM: from } = env;
  if (!key || !from) return undefined;
  return async mail => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    // Never log the recipient or the body: the body holds a sign-in link.
    if (!res.ok) throw new Error(`Mail provider answered ${res.status}`);
  };
};
