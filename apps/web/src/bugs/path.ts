// The track the decorative bugs crawl along: a rounded rectangle just inside the
// edge of the window, measured clockwise from the top-left corner.

export interface PathPoint {
  x: number;
  y: number;
  /** Direction of travel (radians) when moving clockwise. */
  angle: number;
}

interface Track {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  /** Straight run along the top/bottom and along the sides. */
  a: number;
  b: number;
  /** Length of one corner arc. */
  c: number;
}

const track = (w: number, h: number, inset: number, radius: number): Track => {
  const x0 = inset;
  const y0 = inset;
  const x1 = Math.max(x0, w - inset);
  const y1 = Math.max(y0, h - inset);
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  return { x0, y0, x1, y1, r, a: x1 - x0 - 2 * r, b: y1 - y0 - 2 * r, c: (Math.PI * r) / 2 };
};

/** Total length of the track for a `w` x `h` window. */
export const trackLength = (w: number, h: number, inset: number, radius: number): number => {
  const t = track(w, h, inset, radius);
  return 2 * t.a + 2 * t.b + 4 * t.c;
};

/** Point `s` pixels along the track (wraps around, negative values allowed). */
export const pointAt = (s: number, w: number, h: number, inset: number, radius: number): PathPoint => {
  const t = track(w, h, inset, radius);
  const total = 2 * t.a + 2 * t.b + 4 * t.c;
  if (total <= 0) return { x: t.x0, y: t.y0, angle: 0 };
  let d = ((s % total) + total) % total;

  const arc = (cx: number, cy: number, start: number): PathPoint => {
    const theta = start + (t.r > 0 ? d / t.r : 0);
    return { x: cx + t.r * Math.cos(theta), y: cy + t.r * Math.sin(theta), angle: theta + Math.PI / 2 };
  };

  if (d < t.a) return { x: t.x0 + t.r + d, y: t.y0, angle: 0 };
  d -= t.a;
  if (d < t.c) return arc(t.x1 - t.r, t.y0 + t.r, -Math.PI / 2);
  d -= t.c;
  if (d < t.b) return { x: t.x1, y: t.y0 + t.r + d, angle: Math.PI / 2 };
  d -= t.b;
  if (d < t.c) return arc(t.x1 - t.r, t.y1 - t.r, 0);
  d -= t.c;
  if (d < t.a) return { x: t.x1 - t.r - d, y: t.y1, angle: Math.PI };
  d -= t.a;
  if (d < t.c) return arc(t.x0 + t.r, t.y1 - t.r, Math.PI / 2);
  d -= t.c;
  if (d < t.b) return { x: t.x0, y: t.y1 - t.r - d, angle: -Math.PI / 2 };
  d -= t.b;
  return arc(t.x0 + t.r, t.y0 + t.r, Math.PI);
};
