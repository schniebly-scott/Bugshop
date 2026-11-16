import { describe, expect, it } from 'vitest';
import { parseDonateUrl, redactUrl } from '../src/support';

describe('parseDonateUrl', () => {
  it('accepts a plain https link', () => {
    expect(parseDonateUrl('https://example.com/tips')).toBe('https://example.com/tips');
  });

  it('rejects anything else', () => {
    for (const bad of [undefined, '', 'not a url', 'http://example.com', 'javascript:alert(1)', 'data:text/html,x', 'https://user:pw@example.com']) {
      expect(parseDonateUrl(bad)).toBeUndefined();
    }
  });
});

describe('redactUrl', () => {
  it('hides the room id, query and hash of game pages', () => {
    expect(redactUrl('https://bugshop.example/g/AbCdEfGh12345678?x=1#y')).toBe('https://bugshop.example/g/[room]');
  });

  it('drops query strings everywhere, so the password-reset token never leaves', () => {
    expect(redactUrl('https://bugshop.example/reset-password?token=s3cret')).toBe('https://bugshop.example/reset-password');
    expect(redactUrl('https://bugshop.example/?signin=failed#x')).toBe('https://bugshop.example/');
  });

  it('leaves plain pages alone and sends nothing it cannot parse', () => {
    expect(redactUrl('https://bugshop.example/hotseat')).toBe('https://bugshop.example/hotseat');
    expect(redactUrl('nonsense')).toBe('');
  });
});
