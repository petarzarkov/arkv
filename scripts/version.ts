import { execSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { semver } from 'bun';

const isDryRun = process.env.DRY_RUN === 'true';

const ROOT_DIR = resolve(import.meta.dir, '..');
const LOCKFILE_PATH = join(ROOT_DIR, 'bun.lock');

const parseScopes = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const getForcePublishTarget = (): {
  force: boolean;
  packages: string[] | null;
} => {
  const envForce = process.env.FORCE_PUBLISH;
  if (envForce === 'true') return { force: true, packages: null };
  if (envForce && envForce !== 'false')
    return { force: true, packages: parseScopes(envForce) };

  try {
    const commitMessage = execSync('git log -1 --pretty=format:"%s%n%b"', {
      stdio: 'pipe',
    })
      .toString()
      .trim();

    const scopedMatch = commitMessage.match(/\[force-publish:([^\]]+)\]/);
    if (scopedMatch)
      return { force: true, packages: parseScopes(scopedMatch[1]) };
    if (commitMessage.includes('[force-publish]'))
      return { force: true, packages: null };

    return { force: false, packages: null };
  } catch {
    return { force: false, packages: null };
  }
};

const forcePublish = getForcePublishTarget();

const bumpVersion = (
  version: string,
  type: 'major' | 'minor' | 'patch',
): string => {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${String(type)}`);
  }
};

const extractCommitType = (message: string): string | null => {
  // Handle squashed merge commits: "Merge pull request #123 from branch\n\nfeat: message"
  // or "feat(scope): message (#123)"
  const mergeMatch = message.match(
    /(?:Merge.*?\n\n?)?(?:^|\n)(feat|fix|chore|docs|test|style|refactor|perf|build|ci|revert|security|sync)(?:\([^)]+\))?(!)?: /m,
  );

  if (mergeMatch) {
    return mergeMatch[1];
  }

  return null;
};

const determineBumpType = (): 'major' | 'minor' | 'patch' => {
  try {
    const commitMessage = execSync('git log -1 --pretty=format:"%s%n%b"', {
      stdio: 'pipe',
    })
      .toString()
      .trim();

    if (
      commitMessage.includes('!:') ||
      commitMessage.includes('BREAKING CHANGE')
    ) {
      return 'major';
    }

    const commitType = extractCommitType(commitMessage);

    if (commitType === 'feat') {
      return 'minor';
    }

    return 'patch';
  } catch (error) {
    console.warn(
      'Could not determine bump type from commit message, defaulting to patch',
      error,
    );
    return 'patch';
  }
};

const getChangedSrcPackages = (): Set<string> | null => {
  try {
    const out = execSync('git diff-tree --no-commit-id --name-only -r HEAD', {
      stdio: 'pipe',
    })
      .toString()
      .trim();

    if (!out) return null;

    const dirs = new Set<string>();
    for (const file of out.split('\n')) {
      const match = file.match(
        /^packages\/([^/]+)\/(src\/|frontend\/src\/|package\.json|README\.md)/,
      );
      if (match) dirs.add(match[1]);
    }
    return dirs;
  } catch {
    return null;
  }
};

const findPublishablePackages = (): {
  name: string;
  dir: string;
  packageJsonPath: string;
}[] => {
  const packagesDir = resolve(process.cwd(), 'packages');
  const entries = readdirSync(packagesDir, {
    withFileTypes: true,
  });
  const packages: {
    name: string;
    dir: string;
    packageJsonPath: string;
  }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = join(packagesDir, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (pkg.private) continue;
    packages.push({
      name: pkg.name,
      dir: join(packagesDir, entry.name),
      packageJsonPath: pkgJsonPath,
    });
  }

  return packages;
};

const applyVersionBumps = (
  packages: {
    name: string;
    dir: string;
    packageJsonPath: string;
  }[],
  bumpType: 'major' | 'minor' | 'patch',
): { packageJsonPath: string; dir: string }[] => {
  const bumped: {
    packageJsonPath: string;
    dir: string;
  }[] = [];

  for (const { name, dir, packageJsonPath } of packages) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const oldVersion = pkg.version;

    if (!oldVersion) {
      console.warn(`No version found in ${name}. Skipping.`);
      continue;
    }

    const newVersion = bumpVersion(oldVersion, bumpType);

    if (semver.order(newVersion, oldVersion) !== 1) {
      console.warn(
        `Skipping ${name}: new version ${newVersion} is not greater than ${oldVersion}`,
      );
      continue;
    }

    pkg.version = newVersion;

    if (!isDryRun) {
      writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
      bumped.push({ packageJsonPath, dir });
      console.log(`Bumped ${name} from ${oldVersion} to ${newVersion}`);
    } else {
      console.log(
        `[DRY RUN] Would bump ${name} from ${oldVersion} to ${newVersion}`,
      );
    }
  }

  return bumped;
};

const pushVersionCommit = (bumpedFiles: string[]): void => {
  execSync(`git add ${bumpedFiles.join(' ')}`);

  const pkg = JSON.parse(readFileSync(bumpedFiles[0], 'utf-8'));
  const commitMessage = `chore(release): bump version to ${pkg.version} [skip ci]`;
  execSync(`git commit -m "${commitMessage}" --no-verify`);

  const branch =
    process.env.GITHUB_REF_NAME ??
    execSync('git branch --show-current').toString().trim();

  if (!branch) {
    throw new Error('Unable to determine branch for pushing release commit.');
  }

  console.log(`Pushing to branch: ${branch}`);
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    const repo = process.env.GITHUB_REPOSITORY ?? 'petarzarkov/arkv';
    execSync(
      `git push https://x-access-token:${token}@github.com/${repo}.git HEAD:refs/heads/${branch}`,
    );
  } else {
    execSync(`git push origin HEAD:refs/heads/${branch}`);
  }

  console.log(`Successfully pushed version ${pkg.version}`);
};

/**
 * Regenerate the lockfile from scratch so `bun publish` freezes `workspace:^`
 * deps against the just-bumped versions.
 *
 * bun caches each workspace package's version in the lockfile and does NOT
 * refresh it on `bun install` (even with `--force` / `--lockfile-only`); only a
 * from-scratch resolution re-reads every package.json. Without this, a publish
 * after a version bump would freeze a stale range (e.g. `^0.7.0` instead of
 * `^0.7.3`).
 */
const regenerateLockfile = (): void => {
  console.log('Regenerating lockfile to capture current workspace versions...');
  rmSync(LOCKFILE_PATH, { force: true });
  execSync('bun install', { cwd: ROOT_DIR, stdio: 'inherit' });
};

const publishPackage = (pkgDir: string): void => {
  try {
    execSync('bun publish --access public --no-git-checks', {
      cwd: pkgDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        XDG_CONFIG_HOME: process.env.HOME,
      },
    });
  } catch (error) {
    // On a PUT to an existing package, npm returns 404 (not 401/403) when the
    // auth token is missing/expired/invalid. The usual fix is regenerating the
    // NPM_TOKEN repo secret, not a code change.
    console.error(
      `\nPublish failed for ${basename(pkgDir)}. A "404 Not Found" here almost ` +
        `always means the NPM_TOKEN secret is expired or invalid — regenerate it ` +
        `in the repo settings and re-run.\n`,
    );
    throw error;
  }
};

interface PublishablePackage {
  name: string;
  dir: string;
  packageJsonPath: string;
}

const isVersionPublished = (name: string, version: string): boolean => {
  try {
    const out = execSync(`bunx npm view ${name} versions --json`, {
      stdio: 'pipe',
    })
      .toString()
      .trim();
    // npm returns a single quoted string when only one version exists,
    // or a JSON array when multiple versions exist
    const parsed: string | string[] = JSON.parse(out);
    const versions = Array.isArray(parsed) ? parsed : [parsed];
    return versions.includes(version);
  } catch {
    return false;
  }
};

const runForcePublish = (
  packages: PublishablePackage[],
  targetPackages: string[] | null,
): void => {
  const filtered = targetPackages
    ? packages.filter(
        (pkg) =>
          targetPackages.includes(basename(pkg.dir)) ||
          targetPackages.includes(pkg.name),
      )
    : packages;

  if (targetPackages) {
    console.log(
      `\n--- FORCE PUBLISH MODE: publishing ${targetPackages.join(', ')} at current version ---\n`,
    );
  } else {
    console.log(
      '\n--- FORCE PUBLISH MODE: publishing all packages at current versions ---\n',
    );
  }

  if (filtered.length === 0) {
    console.log(
      targetPackages
        ? `Package(s) "${targetPackages.join(', ')}" not found.`
        : 'No publishable packages found.',
    );
    process.exit(0);
  }

  const bumpType = determineBumpType();
  const bumpedFiles: string[] = [];
  const toPublish: { name: string; dir: string; version: string }[] = [];

  // Bump pass: write all version bumps first so the lockfile can be regenerated
  // once before any publish (a package may depend on another being bumped here).
  for (const { name, dir, packageJsonPath } of filtered) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    let { version } = pkg;

    if (isVersionPublished(name, version)) {
      const newVersion = bumpVersion(version, bumpType);
      console.log(
        `${name}@${version} already published, bumping to ${newVersion}`,
      );
      pkg.version = newVersion;
      version = newVersion;

      if (!isDryRun) {
        writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
        bumpedFiles.push(packageJsonPath);
      }
    }

    toPublish.push({ name, dir, version });
  }

  if (isDryRun) {
    for (const { name, version } of toPublish) {
      console.log(`[DRY RUN] Would publish ${name}@${version}`);
    }
    return;
  }

  // Refresh the lockfile so publishes freeze workspace:^ deps against the
  // versions just bumped above.
  if (bumpedFiles.length > 0) {
    regenerateLockfile();
  }

  // Publish pass.
  for (const { name, dir, version } of toPublish) {
    console.log(`Publishing ${name}@${version}...`);
    publishPackage(dir);
  }

  if (bumpedFiles.length > 0) {
    console.log('Committing version changes...');
    pushVersionCommit([...bumpedFiles, LOCKFILE_PATH]);
  }
};

const runVersionBump = (allPackages: PublishablePackage[]): void => {
  const changedSrcPackages = getChangedSrcPackages();

  if (changedSrcPackages !== null && changedSrcPackages.size === 0) {
    console.log('No src changes detected, skipping version bump.');
    process.exit(0);
  }

  if (changedSrcPackages !== null) {
    console.log(
      `Detected src changes in: ${[...changedSrcPackages].join(', ')}`,
    );
  } else {
    console.log('Could not determine changed packages, processing all.');
  }

  const bumpType = determineBumpType();
  console.log(`Determined version bump type: ${bumpType}`);

  const publishablePackages =
    changedSrcPackages === null
      ? allPackages
      : allPackages.filter((pkg) => changedSrcPackages.has(basename(pkg.dir)));

  if (publishablePackages.length === 0) {
    console.log('No publishable packages found.');
    process.exit(0);
  }

  const bumpedPackages = applyVersionBumps(publishablePackages, bumpType);

  if (isDryRun || bumpedPackages.length === 0) return;

  // Refresh the lockfile so the publish below freezes workspace:^ deps against
  // the versions we just bumped.
  regenerateLockfile();

  // Publish BEFORE committing/pushing the bump. If publish fails, main is left
  // untouched so the next run retries the same bump cleanly — a committed-but-
  // unpublished version would otherwise be orphaned ([skip ci] + diff-based
  // change detection means it never gets republished). The isVersionPublished
  // guard makes reruns idempotent and lets a failed-push-after-publish recover.
  console.log('Publishing bumped packages...');
  for (const { dir, packageJsonPath } of bumpedPackages) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (isVersionPublished(pkg.name, pkg.version)) {
      console.log(`${pkg.name}@${pkg.version} already published, skipping`);
      continue;
    }
    console.log(`Publishing ${basename(dir)}...`);
    publishPackage(dir);
  }

  console.log('Committing version changes...');
  pushVersionCommit([
    ...bumpedPackages.map((p) => p.packageJsonPath),
    LOCKFILE_PATH,
  ]);
};

void (async () => {
  if (isDryRun) {
    console.log('\n--- DRY RUN MODE ENABLED ---\n');
  }

  const allPublishablePackages = findPublishablePackages();

  try {
    if (forcePublish.force) {
      runForcePublish(allPublishablePackages, forcePublish.packages);
    } else {
      runVersionBump(allPublishablePackages);
    }
  } catch (error) {
    console.error('Failed to process packages:', error);
    process.exit(1);
  }
})();
