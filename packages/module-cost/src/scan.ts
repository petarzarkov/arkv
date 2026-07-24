import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import type { RawInstance, ScanResult } from './types.js';

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(dir: string): PackageJson | null {
  try {
    return JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf8'),
    ) as PackageJson;
  } catch {
    return null;
  }
}

// Sum of a package's own files, excluding nested node_modules and symlinks.
function dirSize(dir: string): number {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      total += dirSize(join(dir, entry.name));
    } else if (entry.isFile()) {
      try {
        total += statSync(join(dir, entry.name)).size;
      } catch {
        /* unreadable file — ignore */
      }
    }
  }
  return total;
}

function handlePackage(
  pkgDir: string,
  instances: Map<string, RawInstance>,
  seen: Set<string>,
): void {
  let real: string;
  try {
    real = realpathSync(pkgDir);
  } catch {
    return;
  }
  if (seen.has(real)) return;
  seen.add(real);
  const pkg = readPackageJson(real);
  if (pkg?.name) {
    instances.set(real, {
      name: pkg.name,
      version: pkg.version ?? '0.0.0',
      realPath: real,
      deps: { ...pkg.dependencies, ...pkg.optionalDependencies },
      selfSize: dirSize(real),
    });
  }
  walk(join(real, 'node_modules'), instances, seen);
}

// Walk a node_modules directory, handling scopes, nested trees and the virtual
// stores used by pnpm (`.pnpm`) and bun (`.bun`) — `<store>/<id>/node_modules/<pkg>`.
function walk(
  nmDir: string,
  instances: Map<string, RawInstance>,
  seen: Set<string>,
): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(nmDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (name === '.pnpm' || name === '.bun') {
      let subs: Dirent[];
      try {
        subs = readdirSync(join(nmDir, name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sub of subs) {
        if (sub.name.startsWith('.')) continue;
        walk(join(nmDir, name, sub.name, 'node_modules'), instances, seen);
      }
      continue;
    }
    if (name.startsWith('.')) continue;
    const entryPath = join(nmDir, name);
    if (name.startsWith('@')) {
      let scoped: Dirent[];
      try {
        scoped = readdirSync(entryPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const s of scoped) {
        if (s.name.startsWith('.')) continue;
        handlePackage(join(entryPath, s.name), instances, seen);
      }
      continue;
    }
    handlePackage(entryPath, instances, seen);
  }
}

export function scanNodeModules(targetDir: string): ScanResult {
  const instances = new Map<string, RawInstance>();
  const seen = new Set<string>();
  walk(join(targetDir, 'node_modules'), instances, seen);

  const targetPkg = readPackageJson(targetDir);
  const prodDepNames = [
    ...new Set([
      ...Object.keys(targetPkg?.dependencies ?? {}),
      ...Object.keys(targetPkg?.optionalDependencies ?? {}),
    ]),
  ];
  const prodSet = new Set(prodDepNames);
  const devDepNames = [
    ...new Set(Object.keys(targetPkg?.devDependencies ?? {})),
  ].filter((name) => !prodSet.has(name));

  return {
    instances,
    target: {
      name: targetPkg?.name ?? 'project',
      version: targetPkg?.version ?? '0.0.0',
      path: targetDir,
    },
    prodDepNames,
    devDepNames,
  };
}
