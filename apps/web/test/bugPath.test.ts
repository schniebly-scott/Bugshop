import { describe, expect, it } from 'vitest';
import { pointAt, trackLength } from '../src/bugs/path';

describe('bug track', () => {
  const [w, h, inset, r] = [400, 300, 10, 20];

  it('has the length of a rounded rectangle', () => {
    expect(trackLength(w, h, inset, r)).toBeCloseTo(2 * 340 + 2 * 240 + 2 * Math.PI * 20);
  });

  it('stays inside the window and is continuous all the way round', () => {
    const total = trackLength(w, h, inset, r);
    let prev = pointAt(0, w, h, inset, r);
    for (let s = 1; s <= total + 1; s++) {
      const p = pointAt(s, w, h, inset, r);
      expect(p.x).toBeGreaterThanOrEqual(inset - 1e-6);
      expect(p.x).toBeLessThanOrEqual(w - inset + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(inset - 1e-6);
      expect(p.y).toBeLessThanOrEqual(h - inset + 1e-6);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(1.01);
      prev = p;
    }
  });

  it('wraps around and accepts negative distances', () => {
    const total = trackLength(w, h, inset, r);
    const a = pointAt(37, w, h, inset, r);
    for (const s of [37 + total, 37 - total]) {
      const b = pointAt(s, w, h, inset, r);
      expect(b.x).toBeCloseTo(a.x);
      expect(b.y).toBeCloseTo(a.y);
    }
  });

  it('heads right along the top and down the right side', () => {
    expect(pointAt(50, w, h, inset, r)).toMatchObject({ y: inset, angle: 0 });
    const right = pointAt(340 + (Math.PI * 20) / 2 + 50, w, h, inset, r);
    expect(right.x).toBeCloseTo(w - inset);
    expect(right.angle).toBeCloseTo(Math.PI / 2);
  });

  it('survives a window smaller than the inset', () => {
    const p = pointAt(5, 4, 4, 10, 20);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});
