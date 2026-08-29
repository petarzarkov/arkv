import { afterEach, describe, expect, it } from 'bun:test';
import { createSocket } from 'node:dgram';
import { createServer, type Server, type Socket } from 'node:net';
import { SyslogTransport } from './syslog.js';
import { LogLevel, type LogEntry } from './types.js';

const entry = (message: string): LogEntry => ({
  message,
  timestamp: '2026-08-29T00:00:00.000Z',
  pid: 4242,
});

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** A UDP listener on an ephemeral port, collecting datagrams as strings. */
const udpSink = async (): Promise<{ port: number; received: string[] }> => {
  const received: string[] = [];
  const socket = createSocket('udp4');
  socket.on('message', (message) => received.push(message.toString()));
  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
  closers.push(() => socket.close());
  const address = socket.address();
  return { port: typeof address === 'string' ? 0 : address.port, received };
};

/** A TCP listener collecting everything written to it, and able to hang up. */
const tcpSink = async (): Promise<{
  port: number;
  chunks: string[];
  server: Server;
  dropAll: () => void;
}> => {
  const chunks: string[] = [];
  const live: Socket[] = [];
  const server = createServer((socket) => {
    live.push(socket);
    socket.on('data', (data) => chunks.push(data.toString()));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.close());
  const address = server.address();
  return {
    port: typeof address === 'string' || address === null ? 0 : address.port,
    chunks,
    server,
    dropAll: () => {
      for (const socket of live.splice(0)) socket.destroy();
    },
  };
};

const settle = (ms = 60): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('SyslogTransport framing', () => {
  const transport = new SyslogTransport({
    hostname: 'test-host',
    appName: 'billing',
    flushIntervalMs: 0,
  });

  it('writes an RFC 5424 header in front of the entry', () => {
    const line = transport.format(entry('checkout done'), LogLevel.INFO);

    // <134> is facility 16 (local0) times 8 plus severity 6 (info).
    expect(
      line.startsWith(
        '<134>1 2026-08-29T00:00:00.000Z test-host billing 4242 - -',
      ),
    ).toBe(true);
    expect(line).toContain('"message":"checkout done"');
  });

  it('maps each level onto its syslog severity', () => {
    const priority = (level: LogLevel): number =>
      Number(/^<(\d+)>/.exec(transport.format(entry('x'), level))?.[1]);

    expect(priority(LogLevel.FATAL)).toBe(16 * 8 + 2);
    expect(priority(LogLevel.ERROR)).toBe(16 * 8 + 3);
    expect(priority(LogLevel.WARN)).toBe(16 * 8 + 4);
    expect(priority(LogLevel.INFO)).toBe(16 * 8 + 6);
    expect(priority(LogLevel.DEBUG)).toBe(16 * 8 + 7);
    // Syslog has nothing below debug, so verbose shares it.
    expect(priority(LogLevel.VERBOSE)).toBe(16 * 8 + 7);
  });

  it('honours the facility it was given', () => {
    const local7 = new SyslogTransport({ facility: 23, flushIntervalMs: 0 });
    expect(local7.format(entry('x'), LogLevel.INFO).startsWith('<190>1 ')).toBe(
      true,
    );
  });
});

describe('SyslogTransport over UDP', () => {
  it('sends one datagram per entry', async () => {
    const sink = await udpSink();
    const transport = new SyslogTransport({
      port: sink.port,
      hostname: 'h',
      appName: 'app',
      flushIntervalMs: 0,
    });

    transport.write(entry('one'), LogLevel.INFO);
    transport.write(entry('two'), LogLevel.ERROR);
    await transport.flushAsync();
    await settle();

    expect(sink.received).toHaveLength(2);
    expect(sink.received.join('')).toContain('"message":"one"');
    expect(sink.received.some((line) => line.startsWith('<131>1 '))).toBe(true);
    transport.close();
  });

  it('refuses a datagram larger than the limit rather than sending a torn one', async () => {
    const sink = await udpSink();
    const transport = new SyslogTransport({
      port: sink.port,
      flushIntervalMs: 0,
      maxMessageBytes: 480,
    });

    transport.write(entry('x'.repeat(2000)), LogLevel.INFO);
    transport.write(entry('short'), LogLevel.INFO);
    await transport.flushAsync();
    await settle();

    expect(sink.received).toHaveLength(1);
    expect(sink.received[0]).toContain('short');
    transport.close();
  });
});

describe('SyslogTransport over TCP', () => {
  it('octet-counts each frame, per RFC 6587', async () => {
    const sink = await tcpSink();
    const transport = new SyslogTransport({
      protocol: 'tcp',
      port: sink.port,
      hostname: 'h',
      appName: 'app',
      flushIntervalMs: 0,
    });

    transport.write(entry('framed'), LogLevel.INFO);
    await transport.flushAsync();
    await settle();

    const wire = sink.chunks.join('');
    const counted = /^(\d+) (.*)$/s.exec(wire);
    expect(counted).not.toBeNull();
    expect(Buffer.byteLength(counted?.[2] ?? '')).toBe(
      Number(counted?.[1] ?? -1),
    );
    transport.close();
  });

  it('reconnects after the daemon drops the connection', async () => {
    const sink = await tcpSink();
    const transport = new SyslogTransport({
      protocol: 'tcp',
      port: sink.port,
      flushIntervalMs: 0,
      retryBaseMs: 1,
    });

    transport.write(entry('before'), LogLevel.INFO);
    await transport.flushAsync();
    await settle();
    expect(sink.chunks.join('')).toContain('before');

    // What a daemon restart looks like from here.
    sink.dropAll();
    await settle();
    sink.chunks.length = 0;

    transport.write(entry('after'), LogLevel.INFO);
    await transport.flushAsync();
    await settle();

    expect(sink.chunks.join('')).toContain('after');
    transport.close();
  });

  it('counts the loss when the daemon is not there at all', async () => {
    const failures: Error[] = [];
    const transport = new SyslogTransport({
      protocol: 'tcp',
      // Nothing listens here.
      port: 1,
      flushIntervalMs: 0,
      retryBaseMs: 1,
      maxRetries: 1,
      onError: (error) => failures.push(error),
    });

    transport.write(entry('into the void'), LogLevel.INFO);
    await transport.flushAsync();

    expect(transport.droppedCount).toBe(1);
    expect(failures).toHaveLength(1);
    transport.close();
  });
});
