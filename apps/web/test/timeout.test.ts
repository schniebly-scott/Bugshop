import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOIN_TIMEOUT_MESSAGE, withTimeout } from '../src/online/timeout';

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with the value when it arrives in time', async () => {
    const onLate = vi.fn();
    const result = withTimeout(Promise.resolve('room'), 1000, onLate);
    await expect(result).resolves.toBe('room');
    expect(onLate).not.toHaveBeenCalled();
  });

  it('passes an early rejection through', async () => {
    const result = withTimeout(Promise.reject(new Error('Sign in to play.')), 1000, vi.fn());
    await expect(result).rejects.toThrow('Sign in to play.');
  });

  it('rejects when the promise never settles (a socket stuck connecting)', async () => {
    const result = withTimeout(new Promise<string>(() => {}), 1000, vi.fn());
    const check = expect(result).rejects.toThrow(JOIN_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(1000);
    await check;
  });

  it('hands a late value to onLate instead of dropping it', async () => {
    let finish!: (v: string) => void;
    const onLate = vi.fn();
    const result = withTimeout(new Promise<string>(r => (finish = r)), 1000, onLate);
    const check = expect(result).rejects.toThrow(JOIN_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(1000);
    await check;
    finish('late room');
    await vi.advanceTimersByTimeAsync(0);
    expect(onLate).toHaveBeenCalledWith('late room');
  });

  it('ignores a rejection that comes after the timeout', async () => {
    let fail!: (e: Error) => void;
    const result = withTimeout(new Promise<string>((_, r) => (fail = r)), 1000, vi.fn());
    const check = expect(result).rejects.toThrow(JOIN_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(1000);
    await check;
    fail(new Error('closed'));
    await vi.advanceTimersByTimeAsync(0);
  });
});
