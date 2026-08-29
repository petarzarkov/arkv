import { describe, expect, it, spyOn } from 'bun:test';
import { Logger } from './logger.js';
import { SamplingTransport } from './sampling.js';
import { MemoryTransport } from './testing.js';
import { LogLevel, type LogEntry } from './types.js';

const entry = (message: string, event?: string): LogEntry =>
  event === undefined ? { message } : { message, event };

const kept = (sink: MemoryTransport): LogEntry[] =>
  sink.entries.filter((each) => each.droppedEntries === undefined);

describe('SamplingTransport', () => {
  it('keeps everything at rate 1', () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, { rate: 1 });

    for (let at = 0; at < 20; at += 1) {
      sampling.write(entry(`e${at}`), LogLevel.INFO);
    }

    expect(kept(sink)).toHaveLength(20);
    expect(sampling.droppedCount).toBe(0);
  });

  it('keeps roughly the fraction it was given', () => {
    const random = spyOn(Math, 'random');
    // Alternating, so exactly half clear a 0.5 rate.
    let flip = 0;
    random.mockImplementation(() => (flip++ % 2 === 0 ? 0.1 : 0.9));

    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, { rate: 0.5 });
    for (let at = 0; at < 10; at += 1) {
      sampling.write(entry(`e${at}`), LogLevel.INFO);
    }
    random.mockRestore();

    expect(kept(sink)).toHaveLength(5);
    expect(sampling.droppedCount).toBe(5);
  });

  it('never samples a warning or worse, whatever the rate', () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, { rate: 0 });

    sampling.write(entry('routine'), LogLevel.INFO);
    sampling.write(entry('trouble'), LogLevel.WARN);
    sampling.write(entry('worse'), LogLevel.ERROR);
    sampling.write(entry('worst'), LogLevel.FATAL);

    expect(kept(sink).map((each) => each.message)).toEqual([
      'trouble',
      'worse',
      'worst',
    ]);
  });

  it('takes the always-keep floor from the option', () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, {
      rate: 0,
      always: LogLevel.INFO,
    });

    sampling.write(entry('debug detail'), LogLevel.DEBUG);
    sampling.write(entry('routine'), LogLevel.INFO);

    expect(kept(sink).map((each) => each.message)).toEqual(['routine']);
  });

  it('caps a hot loop at the per-window budget', () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, {
      maxPerInterval: 3,
      intervalMs: 60_000,
    });

    for (let at = 0; at < 50; at += 1) {
      sampling.write(entry(`retrying ${at}`, '/poll'), LogLevel.INFO);
    }

    expect(kept(sink)).toHaveLength(3);
    expect(sampling.droppedCount).toBe(47);
  });

  it('budgets per key, so one loud event cannot mute the rest', () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, {
      maxPerInterval: 2,
      intervalMs: 60_000,
    });

    for (let at = 0; at < 20; at += 1) {
      sampling.write(entry('noisy', '/poll'), LogLevel.INFO);
    }
    sampling.write(entry('quiet one', '/checkout'), LogLevel.INFO);

    const messages = kept(sink).map((each) => each.message);
    expect(messages.filter((each) => each === 'noisy')).toHaveLength(2);
    expect(messages).toContain('quiet one');
  });

  it('lets the budget refill when the window rolls', async () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, {
      maxPerInterval: 1,
      intervalMs: 20,
    });

    sampling.write(entry('first', '/x'), LogLevel.INFO);
    sampling.write(entry('blocked', '/x'), LogLevel.INFO);
    await new Promise((resolve) => setTimeout(resolve, 30));
    sampling.write(entry('second window', '/x'), LogLevel.INFO);

    const messages = kept(sink).map((each) => each.message);
    expect(messages).toEqual(['first', 'second window']);
  });

  it('announces the gap rather than leaving the log merely quiet', async () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, {
      maxPerInterval: 1,
      intervalMs: 20,
    });

    for (let at = 0; at < 5; at += 1) {
      sampling.write(entry(`e${at}`, '/x'), LogLevel.INFO);
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    sampling.write(entry('next', '/x'), LogLevel.INFO);

    const notice = sink.entries.find(
      (each) => each.droppedEntries !== undefined,
    );
    expect(notice?.droppedEntries).toBe(4);
    expect(notice?.level).toBe(LogLevel.WARN);
  });

  it('announces what is outstanding when it is closed', () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, {
      maxPerInterval: 1,
      intervalMs: 60_000,
    });

    sampling.write(entry('kept', '/x'), LogLevel.INFO);
    sampling.write(entry('dropped', '/x'), LogLevel.INFO);
    sampling.close();

    expect(sink.entries.some((each) => each.droppedEntries === 1)).toBe(true);
  });

  it('bounds the keys it tracks', () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, {
      maxPerInterval: 1,
      intervalMs: 60_000,
      maxKeys: 4,
      key: (each) => String(each.message),
    });

    for (let at = 0; at < 500; at += 1) {
      sampling.write(entry(`unique-${at}`), LogLevel.INFO);
    }

    // Past the cap it stops tracking rather than growing, so the entries pass.
    expect(kept(sink).length).toBeGreaterThan(400);
  });

  it('reports its own drops and the inner transport together', () => {
    const sink = new MemoryTransport();
    const sampling = new SamplingTransport(sink, { rate: 0 });
    const logger = new Logger({ transports: [sampling] });

    logger.info('thinned');

    const [stats] = logger.stats();
    expect(stats?.name).toBe('SamplingTransport(MemoryTransport)');
    expect(stats?.dropped).toBe(1);
  });

  it('passes a drain through to what it wraps', async () => {
    let flushed = 0;
    const inner = {
      write: () => undefined,
      flushAsync: async () => {
        flushed += 1;
      },
    };
    const sampling = new SamplingTransport(inner);

    await sampling.flushAsync();

    expect(flushed).toBe(1);
  });
});
