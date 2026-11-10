/**
 * Fixed-window counter per key (e.g. per IP). In-memory: fine for a single
 * server process. Expired windows are swept periodically so memory stays bounded.
 */
export class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  private sweeper: NodeJS.Timeout;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.sweeper = setInterval(() => this.sweep(), windowMs);
    this.sweeper.unref();
  }

  /** Count one hit for `key`; returns false once the key is over its limit. */
  take(key: string): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t >= w.resetAt) {
      this.windows.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    w.count++;
    return w.count <= this.limit;
  }

  private sweep(): void {
    const t = this.now();
    for (const [key, w] of this.windows) if (t >= w.resetAt) this.windows.delete(key);
  }

  dispose(): void {
    clearInterval(this.sweeper);
  }
}
