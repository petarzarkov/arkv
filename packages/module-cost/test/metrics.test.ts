import { describe, expect, test } from 'bun:test';
import { buildModel } from '../src/metrics.js';
import type { GraphResult, PackageNode } from '../src/types.js';

function node(
  id: number,
  name: string,
  selfSize: number,
  deps: number[],
): PackageNode {
  return {
    id,
    name,
    version: '1.0.0',
    scope: name.startsWith('@') ? name.split('/')[0] : '(unscoped)',
    path: `/nm/${name}`,
    selfSize,
    transitiveSize: 0,
    exclusiveSize: 0,
    deps,
    dependents: [],
    depth: -1,
    direct: false,
    prod: true,
  };
}

// Shared-dependency diamond:
//   root → @x/a, b
//   @x/a → @x/c, d      b → @x/c, e
// @x/c is shared by both roots; d and e are private to one owner each.
function fixture(): GraphResult {
  const nodes = [
    node(0, '@x/a', 10, [2, 3]),
    node(1, 'b', 10, [2, 4]),
    node(2, '@x/c', 100, []),
    node(3, 'd', 5, []),
    node(4, 'e', 5, []),
  ];
  nodes[2].dependents = [0, 1];
  nodes[3].dependents = [0];
  nodes[4].dependents = [1];
  return {
    nodes,
    rootChildren: [0, 1],
    target: { name: 'proj', version: '0.0.0', path: '/proj' },
  };
}

describe('buildModel', () => {
  test('transitive size = self + all reachable deps (shared deps double-counted)', () => {
    const model = buildModel(fixture());
    expect(model.packages[0].transitiveSize).toBe(115); // a(10) + c(100) + d(5)
    expect(model.packages[1].transitiveSize).toBe(115); // b(10) + c(100) + e(5)
    expect(model.packages[2].transitiveSize).toBe(100);
  });

  test('exclusive size attributes a shared dep to its dominator, private deps to their owner', () => {
    const model = buildModel(fixture());
    // @x/c reachable via both roots → dominated by the synthetic root, not by a or b.
    expect(model.packages[2].exclusiveSize).toBe(100);
    // a exclusively owns d; b exclusively owns e.
    expect(model.packages[0].exclusiveSize).toBe(15);
    expect(model.packages[1].exclusiveSize).toBe(15);
    expect(model.packages[3].exclusiveSize).toBe(5);
  });

  test('scope rollup sums self size per scope, largest first', () => {
    const model = buildModel(fixture());
    expect(model.totalSelfSize).toBe(130);
    expect(model.packageCount).toBe(5);
    expect(model.scopes[0]).toEqual({ scope: '@x', selfSize: 110, count: 2 });
    expect(model.scopes.find((s) => s.scope === '(unscoped)')).toEqual({
      scope: '(unscoped)',
      selfSize: 20,
      count: 3,
    });
  });
});
