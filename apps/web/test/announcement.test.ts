import { describe, expect, it } from 'vitest';
import { ANNOUNCEMENT_MAX_LENGTH } from '@bugshop/protocol';
import { parseAnnouncement } from '../src/online/announcement';

describe('parseAnnouncement', () => {
  const valid = { message: 'Maintenance tonight.', level: 'info', updatedAt: 1_800_000_000_000 };

  it('keeps a well-formed announcement, with only the expected fields', () => {
    expect(parseAnnouncement({ announcement: { ...valid, html: '<b>x</b>' } })).toEqual(valid);
    expect(parseAnnouncement({ announcement: { ...valid, level: 'warning' } })?.level).toBe('warning');
  });

  it('shows nothing for no announcement or a malformed reply', () => {
    for (const bad of [
      null,
      'x',
      {},
      { announcement: null },
      { announcement: { ...valid, message: '' } },
      { announcement: { ...valid, message: 42 } },
      { announcement: { ...valid, message: 'x'.repeat(ANNOUNCEMENT_MAX_LENGTH + 1) } },
      { announcement: { ...valid, message: 'two\nlines' } },
      { announcement: { ...valid, message: 'spoof‮txt' } },
      { announcement: { ...valid, level: 'danger' } },
      { announcement: { ...valid, updatedAt: -1 } },
      { announcement: { ...valid, updatedAt: '1' } },
    ]) {
      expect(parseAnnouncement(bad)).toBeNull();
    }
  });
});
