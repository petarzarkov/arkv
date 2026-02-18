import { describe, expect, it, mock } from 'bun:test';
import { debounce, retry, sleep } from './async.utils.js';

describe('retry', () => {
  it('returns on first success', async () => {
    const fn = mock(() => Promise.resolve('ok'));
    const result = await retry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const fn = mock(() => {
      calls++;
      if (calls < 3)
        return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    });
    const result = await retry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries', async () => {
    const fn = mock(() =>
      Promise.reject(new Error('always fails')),
    );
    await expect(retry(fn, 2, 0)).rejects.toThrow(
      'always fails',
    );
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe('debounce', () => {
  it('delays function execution', async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 50);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    await sleep(80);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on subsequent calls', async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 50);
    debounced();
    await sleep(30);
    debounced();
    await sleep(30);
    expect(fn).not.toHaveBeenCalled();
    await sleep(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('sleep', () => {
  it('resolves after the given time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
