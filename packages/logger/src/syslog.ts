import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { hostname as osHostname } from 'node:os';
import { connect, type Socket as TcpSocket } from 'node:net';
import { safeStringify } from '@arkv/shared';
import {
  BatchTransport,
  type BatchedEntry,
  type BatchTransportOptions,
} from './batch.js';
import { type LogEntry, LogLevel } from './types.js';

export type SyslogProtocol = 'udp' | 'tcp';

export interface SyslogTransportOptions extends BatchTransportOptions {
  host?: string;
  port?: number;
  /** `udp` by default, which is what a local `rsyslog` or `journald` listens on. */
  protocol?: SyslogProtocol;
  /** The `APP-NAME` field. Defaults to the process name. */
  appName?: string;
  /** The `HOSTNAME` field. Defaults to `os.hostname()`. */
  hostname?: string;
  /** RFC 5424 facility. Default `16`, `local0`, which is what an app should use. */
  facility?: number;
  /** How the entry becomes the `MSG` field. Default is the JSON entry. */
  render?: (entry: LogEntry) => string;
  /** Reject a datagram or frame longer than this. Default `8192`, the safe UDP size. */
  maxMessageBytes?: number;
  /**
   * Give up on a TCP connect that has not answered. Default `5000`.
   *
   * A filtered route answers neither `connect` nor `error`, and the OS gives up
   * after minutes. Without a deadline of its own the send stays pending for that
   * long, so no retry starts and `closeAsync` cannot finish.
   */
  connectTimeoutMs?: number;
}

/**
 * RFC 5424 severities. `verbose` maps to `debug` because syslog has no level
 * below it, and `fatal` to `crit` rather than `emerg`: `emerg` means the whole
 * system is unusable and on many hosts is broadcast to every logged-in terminal.
 */
const SEVERITY: Readonly<Record<LogLevel, number>> = Object.freeze({
  [LogLevel.FATAL]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.WARN]: 4,
  [LogLevel.INFO]: 6,
  [LogLevel.DEBUG]: 7,
  [LogLevel.VERBOSE]: 7,
});

const NIL = '-';

/** RFC 5424 wants RFC 3339, which is what an ISO string already is. */
function syslogTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

/** RFC 6587 octet counting: the byte length, a space, then the message. */
const framed = (line: string): string => `${Buffer.byteLength(line)} ${line}`;

/**
 * Ships entries to a syslog daemon, RFC 5424 framed.
 *
 * The header is the part a daemon parses and routes on; the message body stays the
 * JSON entry, so nothing structured is lost on the way to a collector that reads
 * syslog but stores JSON.
 *
 * **UDP is one datagram per entry, and drops are the network's to make.** That is
 * what syslog over UDP is, and the reason it costs nothing at the sender. **TCP is
 * octet-counted** per RFC 6587, which is the framing every modern daemon
 * understands, and it reconnects: a daemon restart is routine and a transport that
 * gave up on the first `ECONNRESET` would be silent from then on.
 */
export class SyslogTransport extends BatchTransport {
  readonly #host: string;
  readonly #port: number;
  readonly #protocol: SyslogProtocol;
  readonly #appName: string;
  readonly #hostname: string;
  readonly #facility: number;
  readonly #render: (entry: LogEntry) => string;
  readonly #maxMessageBytes: number;
  readonly #connectTimeoutMs: number;
  #udp: UdpSocket | undefined;
  #tcp: TcpSocket | undefined;
  #closed = false;

  constructor(options: SyslogTransportOptions = {}) {
    super(options);
    this.#host = options.host ?? '127.0.0.1';
    this.#port = options.port ?? 514;
    this.#protocol = options.protocol ?? 'udp';
    this.#appName = options.appName ?? 'node';
    this.#hostname = options.hostname ?? osHostname();
    this.#facility = options.facility ?? 16;
    this.#render = options.render ?? ((entry) => safeStringify(entry));
    this.#maxMessageBytes = Math.max(480, options.maxMessageBytes ?? 8192);
    this.#connectTimeoutMs = Math.max(1, options.connectTimeoutMs ?? 5000);
  }

  /** One RFC 5424 line, header and all. */
  format(entry: LogEntry, level: LogLevel): string {
    const priority = this.#facility * 8 + (SEVERITY[level] ?? 6);
    // A number is what `timestamp: 'epoch'` writes. Substituting the transport's
    // own clock would relabel the entry with the time it was shipped rather than
    // the time it happened, which for a batched sink is not the same thing.
    const timestamp = syslogTimestamp(entry.timestamp);
    const procId = typeof entry.pid === 'number' ? String(entry.pid) : NIL;
    const header = `<${priority}>1 ${timestamp} ${this.#hostname} ${this.#appName} ${procId} ${NIL} ${NIL}`;
    return `${header} ${this.#render(entry)}`;
  }

  protected override async deliver(
    batch: readonly BatchedEntry[],
  ): Promise<void> {
    const rendered = batch.map((each) => this.format(each.entry, each.level));
    // Measured as it will go on the wire. A TCP frame carries the octet count and
    // a space in front of the line, so a line that just fits the limit does not.
    const lines =
      this.#protocol === 'udp'
        ? rendered.filter(
            (line) => Buffer.byteLength(line) <= this.#maxMessageBytes,
          )
        : rendered.filter(
            (line) => Buffer.byteLength(framed(line)) <= this.#maxMessageBytes,
          );

    // Refusing an oversized message is still losing it, and a silent loss is
    // what every other transport here is built to avoid.
    this.discard(rendered.length - lines.length);

    if (lines.length === 0) {
      return;
    }
    if (this.#protocol === 'udp') {
      await this.#sendDatagrams(lines);
      return;
    }
    await this.#sendFramed(lines);
  }

  override close(): void {
    this.#closed = true;
    super.close();
    this.#udp?.close();
    this.#udp = undefined;
    this.#tcp?.destroy();
    this.#tcp = undefined;
  }

  override async closeAsync(): Promise<void> {
    await super.closeAsync();
    this.close();
  }

  #socket(): UdpSocket {
    if (!this.#udp) {
      const socket = createSocket('udp4');
      // Without a listener an ICMP-driven error event takes the process down.
      socket.on('error', () => {
        this.#udp = undefined;
        socket.close();
      });
      socket.unref();
      this.#udp = socket;
    }
    return this.#udp;
  }

  async #sendDatagrams(lines: readonly string[]): Promise<void> {
    const socket = this.#socket();
    await Promise.all(
      lines.map(
        (line) =>
          new Promise<void>((resolve, reject) => {
            socket.send(line, this.#port, this.#host, (error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      ),
    );
  }

  async #sendFramed(lines: readonly string[]): Promise<void> {
    const socket = await this.#connected();
    const payload = lines.map(framed).join('');

    await new Promise<void>((resolve, reject) => {
      socket.write(payload, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  #connected(): Promise<TcpSocket> {
    const existing = this.#tcp;
    if (existing && !existing.destroyed) {
      return Promise.resolve(existing);
    }
    if (this.#closed) {
      return Promise.reject(new Error('syslog transport is closed'));
    }

    return new Promise<TcpSocket>((resolve, reject) => {
      const socket = connect({ host: this.#host, port: this.#port });
      socket.unref();
      const deadline = setTimeout(() => {
        failed(
          new Error(
            `syslog connect to ${this.#host}:${this.#port} timed out after ${this.#connectTimeoutMs}ms`,
          ),
        );
      }, this.#connectTimeoutMs);
      (deadline as unknown as { unref?: () => void }).unref?.();

      const failed = (error: Error): void => {
        clearTimeout(deadline);
        this.#tcp = undefined;
        socket.destroy();
        reject(error);
      };
      socket.once('error', failed);
      socket.once('connect', () => {
        clearTimeout(deadline);
        socket.off('error', failed);
        // A daemon restart is routine; dropping the reference is what makes the
        // next send reconnect rather than write into a dead socket forever.
        socket.on('error', () => {
          this.#tcp = undefined;
        });
        socket.on('close', () => {
          this.#tcp = undefined;
        });
        this.#tcp = socket;
        resolve(socket);
      });
    });
  }
}
