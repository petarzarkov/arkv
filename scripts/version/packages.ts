import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT_DIR = resolve(import.meta.dir, '../..');
export const PACKAGES_DIR = join(ROOT_DIR, 'packages');

const WORKSPACE_PROTOCOL = 'workspace:';
const DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export interface PublishablePackage {
  name: string;
  dir: string;
  packageJsonPath: string;
}

export const findPublishablePackages = (): PublishablePackage[] => {
  const packages: PublishablePackage[] = [];

  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageJsonPath = join(PACKAGES_DIR, entry.name, 'package.json');
    if (!existsSync(packageJsonPath)) continue;
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (pkg.private) continue;
    packages.push({
      name: pkg.name,
      dir: join(PACKAGES_DIR, entry.name),
      packageJsonPath,
    });
  }

  return packages;
};

const readWorkspaceVersions = (): Map<string, string> => {
  const versions = new Map<string, string>();

  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = join(PACKAGES_DIR, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (pkg.name && pkg.version) versions.set(pkg.name, pkg.version);
  }

  return versions;
};

/**
 * `npm publish` leaves `workspace:` ranges untouched in the packed tarball (unlike
 * `bun publish`), so swap them for concrete ranges, publish, then put the source
 * package.json back exactly as it was — version bump included.
 */
export const withResolvedWorkspaceDeps = (
  pkgDir: string,
  publish: () => void,
): void => {
  const pkgJsonPath = join(pkgDir, 'package.json');
  const original = readFileSync(pkgJsonPath, 'utf-8');
  const pkg = JSON.parse(original);
  const versions = readWorkspaceVersions();
  let resolvedAny = false;

  for (const field of DEPENDENCY_FIELDS) {
    const deps: Record<string, string> | undefined = pkg[field];
    if (!deps) continue;

    for (const [name, range] of Object.entries(deps)) {
      if (!range.startsWith(WORKSPACE_PROTOCOL)) continue;

      const version = versions.get(name);
      if (!version) {
        throw new Error(
          `${pkg.name} depends on ${name} via "${range}" but no workspace package named ${name} was found`,
        );
      }

      const specifier = range.slice(WORKSPACE_PROTOCOL.length);
      deps[name] =
        specifier === '*' || specifier === ''
          ? version
          : `${specifier}${version}`;
      resolvedAny = true;
      console.log(`  ${name}: ${range} -> ${deps[name]}`);
    }
  }

  if (!resolvedAny) {
    publish();
    return;
  }

  writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  try {
    publish();
  } finally {
    writeFileSync(pkgJsonPath, original);
  }
};
