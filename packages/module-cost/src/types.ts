export type Metric = 'self' | 'transitive' | 'exclusive';

export interface RawInstance {
  name: string;
  version: string;
  realPath: string;
  deps: Record<string, string>;
  selfSize: number;
}

export interface ScanResult {
  instances: Map<string, RawInstance>;
  target: TargetInfo;
  prodDepNames: string[];
  devDepNames: string[];
}

export interface TargetInfo {
  name: string;
  version: string;
  path: string;
}

export interface PackageNode {
  id: number;
  name: string;
  version: string;
  scope: string;
  path: string;
  selfSize: number;
  transitiveSize: number;
  exclusiveSize: number;
  deps: number[];
  dependents: number[];
  depth: number;
  direct: boolean;
  prod: boolean;
}

export interface GraphResult {
  nodes: PackageNode[];
  rootChildren: number[];
  target: TargetInfo;
}

export interface ScopeRollup {
  scope: string;
  selfSize: number;
  count: number;
}

export interface CostModel {
  target: TargetInfo;
  totalSelfSize: number;
  packageCount: number;
  generatedAt: number;
  scopes: ScopeRollup[];
  rootChildren: number[];
  packages: PackageNode[];
}
