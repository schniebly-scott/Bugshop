import { describe, expect, it, vi } from 'vitest';

// router.ts subscribes to `popstate` on import; give it a minimal window.
vi.stubGlobal('window', { addEventListener: () => {} });
const { parseRoute } = await import('../src/router');

describe('parseRoute', () => {
  it('maps known paths', () => {
    expect(parseRoute('/')).toEqual({ page: 'home' });
    expect(parseRoute('/hotseat')).toEqual({ page: 'hotseat' });
    expect(parseRoute('/g/D30D2qjIRkA3KJ_C')).toEqual({ page: 'game', roomId: 'D30D2qjIRkA3KJ_C' });
  });

  it('rejects room IDs outside the server alphabet (URLs are untrusted)', () => {
    for (const bad of ['/g/<script>', '/g/%3Cscript%3E', '/g/a b', '/g/abc', '/g/' + 'x'.repeat(33), '/g/../admin', '/g/x/y']) {
      expect(parseRoute(bad)).toEqual({ page: 'not-found' });
    }
  });
});
