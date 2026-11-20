import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AnnouncementReply, ANNOUNCEMENT_MAX_LENGTH, ApiPath } from '@bugshop/protocol';
import { createAnnouncementSource, parseAnnouncementFile } from '../src/announcement.ts';
import { createGameServer } from '../src/app.ts';
import { loadEnv } from '../src/env.ts';
import { WEB_ORIGIN } from './helpers.ts';

const NOW = 1_800_000_000_000;
const valid = { message: 'Server maintenance at 20:00 UTC.', level: 'info', updatedAt: NOW - 1000 };
const parse = (data: unknown) => parseAnnouncementFile(typeof data === 'string' ? data : JSON.stringify(data), NOW);

describe('parseAnnouncementFile', () => {
  it('accepts a valid announcement and returns only the public fields', () => {
    expect(parse(valid)).toEqual(valid);
    expect(parse({ ...valid, level: 'warning', expiresAt: NOW + 60_000 })).toEqual({ ...valid, level: 'warning' });
  });

  it('trims the message', () => {
    expect(parse({ ...valid, message: '  Hello  ' })?.message).toBe('Hello');
  });

  it('rejects bad JSON, wrong shapes and extra fields', () => {
    for (const bad of [
      'not json',
      'null',
      '[]',
      {},
      { ...valid, level: 'danger' },
      { ...valid, updatedAt: 'yesterday' },
      { ...valid, message: '' },
      { ...valid, message: '   ' },
      { ...valid, html: '<b>hi</b>' },
    ]) {
      expect(parse(bad)).toBeNull();
    }
  });

  it('rejects messages that are too long or contain control or bidi characters', () => {
    expect(parse({ ...valid, message: 'x'.repeat(ANNOUNCEMENT_MAX_LENGTH) })).not.toBeNull();
    expect(parse({ ...valid, message: 'x'.repeat(ANNOUNCEMENT_MAX_LENGTH + 1) })).toBeNull();
    expect(parse({ ...valid, message: 'line one\nline two' })).toBeNull();
    expect(parse({ ...valid, message: 'abc\u0000def' })).toBeNull();
    expect(parse({ ...valid, message: 'abc‮def' })).toBeNull();
  });

  it('rejects an oversized file', () => {
    expect(parse(JSON.stringify(valid) + ' '.repeat(5000))).toBeNull();
  });

  it('hides an expired announcement', () => {
    expect(parse({ ...valid, expiresAt: NOW })).toBeNull();
    expect(parse({ ...valid, expiresAt: NOW - 1 })).toBeNull();
  });
});

describe('createAnnouncementSource', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bugshop-announce-'));
  const file = join(dir, 'announcement.json');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null without a path or without a file', async () => {
    expect(await createAnnouncementSource(undefined).current()).toBeNull();
    expect(await createAnnouncementSource(join(dir, 'missing.json')).current()).toBeNull();
  });

  it('reads the file, and picks up changes only after the check interval', async () => {
    let now = NOW;
    const source = createAnnouncementSource(file, () => now);
    writeFileSync(file, JSON.stringify(valid));
    expect(await source.current()).toEqual(valid);

    const changed = { ...valid, message: 'Back online.', updatedAt: NOW };
    writeFileSync(file, JSON.stringify(changed));
    utimesSync(file, new Date(NOW + 5000), new Date(NOW + 5000)); // make sure the mtime moves
    now += 1000;
    expect(await source.current()).toEqual(valid); // not re-checked yet
    now += 10_000;
    expect(await source.current()).toEqual(changed);

    rmSync(file); // cleared from the dashboard
    now += 10_000;
    expect(await source.current()).toBeNull();
  });

  it('stops showing a message once it expires, without the file changing', async () => {
    let now = NOW;
    const source = createAnnouncementSource(file, () => now);
    writeFileSync(file, JSON.stringify({ ...valid, expiresAt: NOW + 5000 }));
    expect(await source.current()).toEqual(valid);
    now += 5000;
    expect(await source.current()).toBeNull();
  });
});

describe('GET /api/announcement', () => {
  const PORT = 37000 + Math.floor(Math.random() * 2000);
  const dir = mkdtempSync(join(tmpdir(), 'bugshop-announce-http-'));
  const file = join(dir, 'announcement.json');
  let server: ReturnType<typeof createGameServer>;

  beforeAll(async () => {
    writeFileSync(file, JSON.stringify({ ...valid, updatedAt: Date.now() }));
    server = createGameServer(
      loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGINS: WEB_ORIGIN, DATABASE_PATH: ':memory:', ANNOUNCEMENT_PATH: file }),
    );
    await server.listen(PORT, '127.0.0.1');
  });
  afterAll(async () => {
    await server.gracefullyShutdown(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('is public and returns the current message', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}${ApiPath.announcement}`, { headers: { Origin: WEB_ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    const body = (await res.json()) as AnnouncementReply;
    expect(body.announcement).toMatchObject({ message: valid.message, level: 'info' });
    expect(Object.keys(body.announcement!).sort()).toEqual(['level', 'message', 'updatedAt']);
  });
});
