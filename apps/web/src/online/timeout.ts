/** Rejection reason when a join takes too long. `describeJoinError` matches on it. */
export const JOIN_TIMEOUT_MESSAGE = 'Timed out connecting to the game.';

/**
 * Settle with `pending`, or reject after `ms` if it hasn't settled by then.
 *
 * A browser can leave a WebSocket waiting forever without an error (for
 * example queued behind another socket to the same host that is stuck
 * connecting), and the Colyseus SDK has no time limit of its own, so a join
 * could hang with the button spinning. If `pending` resolves after we gave up,
 * `onLate` gets the value so it can be cleaned up (e.g. leave the room so the
 * seat isn't held by a page that no longer waits for it).
 */
export const withTimeout = <T>(pending: Promise<T>, ms: number, onLate: (value: T) => void): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(JOIN_TIMEOUT_MESSAGE));
    }, ms);
    pending.then(
      value => {
        clearTimeout(timer);
        if (timedOut) onLate(value);
        else resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        if (!timedOut) reject(error);
      },
    );
  });
