import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GraphResult, PackageNode, ScanResult } from './types.js';

function scopeOf(name: string): string {
  return name.startsWith('@') ? name.split('/')[0] : '(unscoped)';
}

// Node-style resolution: walk up ancestor node_modules from `fromDir` until the dep is found.
function resolveDep(
  fromDir: string,
  depName: string,
  index: Map<string, number>,
): number | null {
  let dir = fromDir;
  for (;;) {
    try {
      const real = realpathSync(join(dir, 'node_modules', depName));
      const id = index.get(real);
      if (id !== undefined) return id;
    } catch {
      /* not resolvable here — keep walking up */
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function buildGraph(scan: ScanResult): GraphResult {
  const instances = [...scan.instances.values()];
  const index = new Map<string, number>();
  instances.forEach((inst, id) => index.set(inst.realPath, id));

  const nodes: PackageNode[] = instances.map((inst, id) => ({
    id,
    name: inst.name,
    version: inst.version,
    scope: scopeOf(inst.name),
    path: inst.realPath,
    selfSize: inst.selfSize,
    transitiveSize: 0,
    exclusiveSize: 0,
    deps: [],
    dependents: [],
    depth: -1,
    direct: false,
    prod: false,
  }));

  instances.forEach((inst, id) => {
    const linked = new Set<number>();
    for (const depName of Object.keys(inst.deps)) {
      const target = resolveDep(inst.realPath, depName, index);
      if (target === null || target === id || linked.has(target)) continue;
      linked.add(target);
      nodes[id].deps.push(target);
      nodes[target].dependents.push(id);
    }
  });

  const rootChildren: number[] = [];
  const rootSet = new Set<number>();
  const prodRootIds: number[] = [];
  const addRoot = (depName: string, isProd: boolean): void => {
    const target = resolveDep(scan.target.path, depName, index);
    if (target === null) return;
    if (isProd) prodRootIds.push(target);
    if (!rootSet.has(target)) {
      rootSet.add(target);
      rootChildren.push(target);
    }
  };
  for (const depName of scan.prodDepNames) addRoot(depName, true);
  for (const depName of scan.devDepNames) addRoot(depName, false);
  for (const id of rootChildren) nodes[id].direct = true;

  // Production closure: follow dependency edges out from the root's prod dependencies.
  const prodSet = new Set<number>(prodRootIds);
  const prodStack = [...prodRootIds];
  while (prodStack.length) {
    const id = prodStack.pop() as number;
    for (const dep of nodes[id].deps) {
      if (!prodSet.has(dep)) {
        prodSet.add(dep);
        prodStack.push(dep);
      }
    }
  }
  for (const node of nodes) node.prod = prodSet.has(node.id);

  const queue: number[] = [];
  for (const id of rootChildren) {
    nodes[id].depth = 1;
    queue.push(id);
  }
  while (queue.length) {
    const id = queue.shift() as number;
    const nextDepth = nodes[id].depth + 1;
    for (const dep of nodes[id].deps) {
      if (nodes[dep].depth === -1 || nodes[dep].depth > nextDepth) {
        nodes[dep].depth = nextDepth;
        queue.push(dep);
      }
    }
  }

  return { nodes, rootChildren, target: scan.target };
}
