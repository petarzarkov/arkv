import {
  BatchTransport,
  type BatchedEntry,
  type BatchTransportOptions,
} from './batch.js';
import { jsonFormat } from './format.js';
import type { LogFormatter } from './types.js';

export interface HttpTransportOptions extends BatchTransportOptions {
  url: string;
  /** Default `POST`. */
  method?: string;
  headers?: Record<string, string>;
  /**
   * A batch as a request body. The default is NDJSON, one entry per line, which
   * is what Elasticsearch, Loki's raw endpoint and most collectors read.
   *
   * This is the seam every vendor differs at, and the reason there is one HTTP
   * transport here rather than four. Datadog wants a JSON array, Splunk HEC wants
   * concatenated `{"event":...}` objects, Loki's push API wants streams and
   * values, OTLP/HTTP wants a resourceLogs envelope. Each is a function of the
   * batch, so each is this option and none is a new class to maintain.
   */
  encode?: (batch: readonly BatchedEntry[]) => string;
  /** Default `application/x-ndjson`, or whatever `encode` produces. */
  contentType?: string;
  /** Abort a request that has not answered. Default `10_000`. */
  timeoutMs?: number;
  /**
   * The `fetch` to use. Defaults to the global one, which Node has had since 18.
   * Supply one to route through a proxy or a keep-alive agent, or to test without
   * a network.
   */
  fetch?: typeof fetch;
  /** How each entry is rendered by the default NDJSON encoder. */
  format?: LogFormatter;
}

/** A send that failed, carrying what the collector said about repeating it. */
export class HttpDeliveryError extends Error {
  override readonly name = 'HttpDeliveryError';
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/**
 * `Retry-After` is either a number of seconds or an HTTP date. Both are common,
 * and ignoring it is how a client keeps hammering a collector that just asked it
 * not to.
 *
 * Exported for its own test rather than reached through a timing assertion. It is
 * not re-exported from the package index.
 */
export function retryAfterMs(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/**
 * Ships batches to an HTTP collector.
 *
 * Everything about buffering, bounding, retrying and accounting comes from
 * {@link BatchTransport}; this adds the request, the status reading and the
 * `Retry-After` handling.
 *
 * A 4xx other than 408 and 429 is not retried: a collector that rejected the
 * payload will reject the same bytes again, and spending the retry budget on it
 * only delays the batches behind it.
 *
 * ```ts
 * new HttpTransport({
 *   url: 'https://http-intake.logs.datadoghq.com/api/v2/logs',
 *   headers: { 'DD-API-KEY': key },
 *   contentType: 'application/json',
 *   encode: (batch) => JSON.stringify(batch.map((each) => each.entry)),
 * });
 * ```
 */
export class HttpTransport extends BatchTransport {
  readonly #url: string;
  readonly #method: string;
  readonly #headers: Record<string, string>;
  readonly #encode: (batch: readonly BatchedEntry[]) => string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: HttpTransportOptions) {
    super(options);
    const format = options.format ?? jsonFormat;
    this.#url = options.url;
    this.#method = options.method ?? 'POST';
    this.#encode =
      options.encode ??
      // Terminated, not merely separated: NDJSON says every record ends with a
      // newline, and Elasticsearch's `_bulk` rejects a body whose last one does
      // not.
      ((batch) =>
        `${batch.map((each) => format(each.entry, each.level)).join('\n')}\n`);
    this.#headers = {
      'content-type': options.contentType ?? 'application/x-ndjson',
      ...options.headers,
    };
    this.#timeoutMs = Math.max(0, options.timeoutMs ?? 10_000);
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  protected override async deliver(
    batch: readonly BatchedEntry[],
  ): Promise<void> {
    const response = await this.#fetch(this.#url, {
      method: this.#method,
      headers: this.#headers,
      body: this.#encode(batch),
      ...(this.#timeoutMs > 0
        ? { signal: AbortSignal.timeout(this.#timeoutMs) }
        : {}),
    });

    if (response.ok) {
      // Read to completion so the connection can be reused rather than held open
      // by an unconsumed body.
      await response.arrayBuffer().catch(() => undefined);
      return;
    }

    const after = retryAfterMs(response.headers.get('retry-after'));
    await response.arrayBuffer().catch(() => undefined);
    throw new HttpDeliveryError(
      `${this.#url} answered ${response.status}`,
      response.status,
      after,
    );
  }

  protected override retryable(error: unknown): boolean {
    if (!(error instanceof HttpDeliveryError) || error.status === undefined) {
      // A network failure, a DNS failure or a timeout. Worth repeating.
      return true;
    }
    if (error.status === 408 || error.status === 429) {
      return true;
    }
    return error.status >= 500;
  }

  protected override retryDelay(error: unknown, attempt: number): number {
    if (
      error instanceof HttpDeliveryError &&
      error.retryAfterMs !== undefined
    ) {
      return error.retryAfterMs;
    }
    return super.retryDelay(error, attempt);
  }
}
