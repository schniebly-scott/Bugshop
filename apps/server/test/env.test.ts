import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env.ts';

const prod = {
  NODE_ENV: 'production',
  ALLOWED_ORIGINS: 'https://bugshop.example',
  AUTH_SECRET: 'x'.repeat(32),
  PUBLIC_URL: 'https://api.bugshop.example',
  RESEND_API_KEY: 're_test',
  MAIL_FROM: 'Bugshop <camp@bugshop.example>',
};

describe('environment', () => {
  it('accepts a complete production configuration', () => {
    expect(loadEnv(prod).PUBLIC_URL).toBe('https://api.bugshop.example');
  });

  it('refuses to start in production without the account secrets', () => {
    for (const k of ['AUTH_SECRET', 'PUBLIC_URL', 'RESEND_API_KEY'] as const) {
      const { [k]: _, ...rest } = prod;
      expect(() => loadEnv(k === 'RESEND_API_KEY' ? { ...rest, MAIL_FROM: undefined } : rest)).toThrow(k);
    }
    expect(() => loadEnv({ ...prod, AUTH_SECRET: 'too short' })).toThrow();
  });

  it('wants sign-in credentials in pairs', () => {
    expect(() => loadEnv({ GOOGLE_CLIENT_ID: 'id' })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => loadEnv({ APPLE_CLIENT_SECRET: 'secret' })).toThrow(/APPLE_CLIENT_ID/);
    expect(() => loadEnv({ RESEND_API_KEY: 'key' })).toThrow(/MAIL_FROM/);
  });
});
