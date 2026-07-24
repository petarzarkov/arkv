import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildGraph } from '../src/graph.js';
import { scanNodeModules } from '../src/scan.js';

const root = mkdtempSync(join(tmpdir(), 'module-cost-scan-'));

function fill(relPath: string, bytes: number): number {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, 'x'.repeat(bytes));
  return bytes;
}

function json(relPath: string, value: unknown): number {
  const text = JSON.stringify(value);
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return Buffer.byteLength(text);
}

// proj → foo (prod) → bar (nested); proj → baz (dev)
json('package.json', {
  name: 'proj',
  dependencies: { foo: '1.0.0' },
  devDependencies: { baz: '1.0.0' },
});
const fooManifest = json('node_modules/foo/package.json', {
  name: 'foo',
  version: '1.2.3',
  dependencies: { bar: '1.0.0' },
});
const fooCode = fill('node_modules/foo/index.js', 100);
const fooDoc = fill('node_modules/foo/readme.md', 20);
const barManifest = json('node_modules/foo/node_modules/bar/package.json', {
  name: 'bar',
  version: '2.0.0',
});
fill('node_modules/foo/node_modules/bar/index.js', 50);
json('node_modules/baz/package.json', { name: 'baz', version: '3.0.0' });
fill('node_modules/baz/index.js', 30);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('scanNodeModules', () => {
  const result = scanNodeModules(root);
  const instances = [...result.instances.values()];
  const foo = instances.find((i) => i.name === 'foo');
  const bar = instances.find((i) => i.name === 'bar');

  test('reads target manifest and splits prod vs dev direct deps', () => {
    expect(result.target.name).toBe('proj');
    expect(result.prodDepNames).toEqual(['foo']);
    expect(result.devDepNames).toEqual(['baz']);
  });

  test('self size counts a package’s own files but not nested node_modules', () => {
    expect(foo).toBeDefined();
    // foo owns index.js + readme.md + its manifest — bar's 50 bytes must be excluded.
    expect(foo?.selfSize).toBe(fooCode + fooDoc + fooManifest);
  });

  test('discovers nested (non-hoisted) dependencies as their own instances', () => {
    expect(bar).toBeDefined();
    expect(bar?.version).toBe('2.0.0');
    expect(bar?.selfSize).toBe(50 + barManifest);
    expect(Object.keys(foo?.deps ?? {})).toContain('bar');
  });
});

describe('buildGraph prod/dev classification', () => {
  const graph = buildGraph(scanNodeModules(root));
  const byName = (name: string): (typeof graph.nodes)[number] | undefined =>
    graph.nodes.find((n) => n.name === name);

  test('a prod dependency and its transitive deps are production', () => {
    expect(byName('foo')?.prod).toBe(true);
    expect(byName('bar')?.prod).toBe(true); // transitive of a prod dep
  });

  test('a dev-only dependency is not production (but still direct)', () => {
    expect(byName('baz')?.prod).toBe(false);
    expect(byName('baz')?.direct).toBe(true);
  });
});
