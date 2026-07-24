import { buildGraph } from './graph.js';
import { buildModel } from './metrics.js';
import { scanNodeModules } from './scan.js';
import type { CostModel } from './types.js';

export function analyze(dir: string): CostModel {
  return buildModel(buildGraph(scanNodeModules(dir)));
}
