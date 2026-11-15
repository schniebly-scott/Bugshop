import { describe, expect, it } from 'vitest';
import { parseDonateUrl, redactGameUrl } from '../src/support';

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

describe('redactGameUrl', () => {
  it('hides the room id, query and hash of game pages', () => {
    expect(redactGameUrl('https://bugshop.example/g/AbCdEfGh12345678?x=1#y')).toBe('https://bugshop.example/g/[room]');
  });

  it('leaves other pages alone', () => {
    expect(redactGameUrl('https://bugshop.example/')).toBe('https://bugshop.example/');
    expect(redactGameUrl('https://bugshop.example/hotseat')).toBe('https://bugshop.example/hotseat');
    expect(redactGameUrl('nonsense')).toBe('nonsense');
  });
});
