import type {
  CostModel,
  GraphResult,
  PackageNode,
  ScopeRollup,
} from './types.js';

// Transitive size: self + every reachable dependency (double-counts shared deps by design).
function computeTransitive(nodes: PackageNode[]): void {
  const n = nodes.length;
  const visited = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    visited.fill(0);
    visited[start] = 1;
    let sum = 0;
    const stack = [start];
    while (stack.length) {
      const id = stack.pop() as number;
      sum += nodes[id].selfSize;
      for (const dep of nodes[id].deps) {
        if (!visited[dep]) {
          visited[dep] = 1;
          stack.push(dep);
        }
      }
    }
    nodes[start].transitiveSize = sum;
  }
}

// Exclusive (retained) size via the dominator tree rooted at a synthetic project node.
// A package's exclusive size = self-sizes of everything reachable ONLY through it.
function computeExclusive(nodes: PackageNode[], rootChildren: number[]): void {
  const realN = nodes.length;
  const root = realN;
  const n = realN + 1;

  const succ: number[][] = nodes.map((node) => node.deps);
  succ.push(rootChildren.slice());

  const visited = new Uint8Array(n);
  const order: number[] = [];
  const stack: { node: number; i: number }[] = [{ node: root, i: 0 }];
  visited[root] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.i < succ[top.node].length) {
      const next = succ[top.node][top.i++];
      if (!visited[next]) {
        visited[next] = 1;
        stack.push({ node: next, i: 0 });
      }
    } else {
      order.push(top.node);
      stack.pop();
    }
  }

  const rpo = order.slice().reverse();
  const rpoNum = new Int32Array(n).fill(-1);
  rpo.forEach((node, idx) => {
    rpoNum[node] = idx;
  });

  const pred: number[][] = Array.from({ length: n }, () => []);
  for (let u = 0; u < n; u++) {
    for (const v of succ[u]) pred[v].push(u);
  }

  const idom = new Int32Array(n).fill(-1);
  idom[root] = root;
  const intersect = (a: number, b: number): number => {
    while (a !== b) {
      while (rpoNum[a] > rpoNum[b]) a = idom[a];
      while (rpoNum[b] > rpoNum[a]) b = idom[b];
    }
    return a;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of rpo) {
      if (node === root) continue;
      let newIdom = -1;
      for (const p of pred[node]) {
        if (idom[p] === -1) continue;
        newIdom = newIdom === -1 ? p : intersect(p, newIdom);
      }
      if (newIdom !== -1 && idom[node] !== newIdom) {
        idom[node] = newIdom;
        changed = true;
      }
    }
  }

  const excl = new Float64Array(n);
  for (let i = 0; i < realN; i++) excl[i] = nodes[i].selfSize;
  for (const node of order) {
    if (node === root) continue;
    const dom = idom[node];
    if (dom !== -1 && dom !== node) excl[dom] += excl[node];
  }
  for (let i = 0; i < realN; i++) nodes[i].exclusiveSize = excl[i];
}

export function buildModel(graph: GraphResult): CostModel {
  const { nodes, rootChildren, target } = graph;
  computeTransitive(nodes);
  computeExclusive(nodes, rootChildren);

  const scopeMap = new Map<string, ScopeRollup>();
  let totalSelfSize = 0;
  for (const node of nodes) {
    totalSelfSize += node.selfSize;
    const existing = scopeMap.get(node.scope);
    if (existing) {
      existing.selfSize += node.selfSize;
      existing.count += 1;
    } else {
      scopeMap.set(node.scope, {
        scope: node.scope,
        selfSize: node.selfSize,
        count: 1,
      });
    }
  }
  const scopes = [...scopeMap.values()].sort((a, b) => b.selfSize - a.selfSize);

  return {
    target,
    totalSelfSize,
    packageCount: nodes.length,
    generatedAt: Date.now(),
    scopes,
    rootChildren,
    packages: nodes,
  };
}
