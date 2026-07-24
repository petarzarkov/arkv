import type { CostModel } from './types';

export async function fetchModel(): Promise<CostModel> {
  const res = await fetch('/api/tree');
  if (!res.ok) throw new Error(`Failed to load analysis (HTTP ${res.status})`);
  return (await res.json()) as CostModel;
}
