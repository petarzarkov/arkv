import { describe, expect, it } from 'bun:test';
import { HttpDeliveryError, HttpTransport, retryAfterMs } from './http.js';
import { LogLevel, type LogEntry } from './types.js';

interface Call {
  readonly url: string;
  readonly body: string;
  readonly headers: Record<string, string>;
}

/** A `fetch` that answers from a script and records what it was asked. */
const stubFetch = (
  answers: (Response | Error)[],
): { fetch: typeof fetch; calls: Call[] } => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      // Always a string here: every encoder in this package produces one.
      body: init.body as string,
      headers: init.headers as Record<string, string>,
    });
    const answer = answers.shift() ?? new Response(null, { status: 200 });
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
};

const entry = (message: string): LogEntry => ({ message });

const transport = (
  fetchImpl: typeof fetch,
  options: Partial<ConstructorParameters<typeof HttpTransport>[0]> = {},
): HttpTransport =>
  new HttpTransport({
    url: 'https://collector.example/logs',
    fetch: fetchImpl,
    flushIntervalMs: 0,
    retryBaseMs: 1,
    ...options,
  });

describe('HttpTransport', () => {
  it('posts a batch as NDJSON by default', async () => {
    const { fetch, calls } = stubFetch([]);
    const sink = transport(fetch);

    sink.write(entry('one'), LogLevel.INFO);
    sink.write(entry('two'), LogLevel.INFO);
    await sink.flushAsync();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://collector.example/logs');
    expect(calls[0]?.headers['content-type']).toBe('application/x-ndjson');
    const body = calls[0]?.body ?? '';
    // Terminated, not separated: the last record ends with a newline too, which
    // is what NDJSON says and what Elasticsearch's `_bulk` requires.
    expect(body.endsWith('\n')).toBe(true);
    const lines = body.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string).message).toBe('one');
    expect(JSON.parse(lines[1] as string).message).toBe('two');
  });

  it('takes the vendor shape from encode, which is the whole seam', async () => {
    const { fetch, calls } = stubFetch([]);
    const sink = transport(fetch, {
      contentType: 'application/json',
      headers: { 'dd-api-key': 'secret' },
      encode: (batch) => JSON.stringify(batch.map((each) => each.entry)),
    });

    sink.write(entry('one'), LogLevel.INFO);
    await sink.flushAsync();

    expect(calls[0]?.headers['content-type']).toBe('application/json');
    expect(calls[0]?.headers['dd-api-key']).toBe('secret');
    expect(JSON.parse(calls[0]?.body ?? '[]')).toHaveLength(1);
  });

  it('retries a 503 and keeps the batch', async () => {
    const { fetch, calls } = stubFetch([
      new Response(null, { status: 503 }),
      new Response(null, { status: 200 }),
    ]);
    const sink = transport(fetch);

    sink.write(entry('one'), LogLevel.INFO);
    await sink.flushAsync();

    expect(calls).toHaveLength(2);
    expect(sink.droppedCount).toBe(0);
  });

  it('retries a network failure', async () => {
    const { fetch, calls } = stubFetch([new TypeError('fetch failed')]);
    const sink = transport(fetch);

    sink.write(entry('one'), LogLevel.INFO);
    await sink.flushAsync();

    expect(calls).toHaveLength(2);
    expect(sink.droppedCount).toBe(0);
  });

  it('does not retry a 400, because the same bytes fail the same way', async () => {
    const { fetch, calls } = stubFetch([new Response(null, { status: 400 })]);
    const sink = transport(fetch, { onError: () => undefined });

    sink.write(entry('malformed'), LogLevel.INFO);
    await sink.flushAsync();

    expect(calls).toHaveLength(1);
    expect(sink.droppedCount).toBe(1);
  });

  it('retries a 429 and a 408, which are not the collector rejecting the payload', async () => {
    for (const status of [408, 429]) {
      const { fetch, calls } = stubFetch([
        new Response(null, { status }),
        new Response(null, { status: 200 }),
      ]);
      const sink = transport(fetch);

      sink.write(entry('one'), LogLevel.INFO);
      await sink.flushAsync();

      expect(calls).toHaveLength(2);
    }
  });

  it('waits as long as Retry-After asked, rather than its own backoff', async () => {
    const { fetch, calls } = stubFetch([
      new Response(null, { status: 429, headers: { 'retry-after': '0.15' } }),
      new Response(null, { status: 200 }),
    ]);
    // 1 ms backoff, so anything near 150 ms is the header being obeyed and not
    // the exponential default.
    const sink = transport(fetch, { retryBaseMs: 1 });

    sink.write(entry('one'), LogLevel.INFO);
    const started = Date.now();
    await sink.flushAsync();

    expect(calls).toHaveLength(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(sink.droppedCount).toBe(0);
  });

  it('reports the status on the error it raises', async () => {
    const failures: Error[] = [];
    const { fetch } = stubFetch([new Response(null, { status: 403 })]);
    const sink = transport(fetch, { onError: (error) => failures.push(error) });

    sink.write(entry('one'), LogLevel.INFO);
    await sink.flushAsync();

    const failure = failures[0] as HttpDeliveryError;
    expect(failure).toBeInstanceOf(HttpDeliveryError);
    expect(failure.status).toBe(403);
    expect(failure.message).toContain('403');
  });
});

describe('retryAfterMs', () => {
  it('reads a count of seconds', () => {
    expect(retryAfterMs('2')).toBe(2000);
    expect(retryAfterMs('0.15')).toBe(150);
  });

  it('reads an HTTP date as the distance from now', () => {
    const at = new Date(Date.now() + 5000).toUTCString();
    const delay = retryAfterMs(at) as number;

    // The header carries whole seconds, so the parsed distance lands under the
    // five it was built from.
    expect(delay).toBeGreaterThan(3500);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('never asks for a wait in the past', () => {
    expect(retryAfterMs(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
    expect(retryAfterMs('-5')).toBe(0);
  });

  it('is undefined when there is no header or it makes no sense', () => {
    expect(retryAfterMs(null)).toBeUndefined();
    expect(retryAfterMs('soon please')).toBeUndefined();
  });
});
