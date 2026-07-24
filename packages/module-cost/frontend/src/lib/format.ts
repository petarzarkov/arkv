import type { Metric, PackageNode } from '../types';

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export function sizeFor(pkg: PackageNode, metric: Metric): number {
  if (metric === 'self') return pkg.selfSize;
  if (metric === 'transitive') return pkg.transitiveSize;
  return pkg.exclusiveSize;
}

export const METRIC_LABELS: Record<Metric, string> = {
  self: 'Self',
  transitive: 'Transitive',
  exclusive: 'Exclusive',
};

export const METRIC_HELP: Record<Metric, string> = {
  self: 'A package’s own files (excludes nested node_modules). Exact; sums to the real total.',
  transitive:
    'Self plus everything it depends on — double-counts deps shared with other packages.',
  exclusive:
    'What you’d actually reclaim by removing it: files reachable only through this package.',
};
