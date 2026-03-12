import { execSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { semver } from 'bun';

const isDryRun = process.env.DRY_RUN === 'true';

const checkForcePublish = (): boolean => {
  if (process.env.FORCE_PUBLISH === 'true') return true;
  try {
    const commitMessage = execSync(
      'git log -1 --pretty=format:"%s%n%b"',
      { stdio: 'pipe' },
    )
      .toString()
      .trim();
    return commitMessage.includes('[force-publish]');
  } catch {
    return false;
  }
};

const isForcePublish = checkForcePublish();

const bumpVersion = (
  version: string,
  type: 'major' | 'minor' | 'patch',
): string => {
  const [major, minor, patch] = version
    .split('.')
    .map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}`);
  }
};

const extractCommitType = (
  message: string,
): string | null => {
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

const determineBumpType = ():
  | 'major'
  | 'minor'
  | 'patch' => {
  try {
    const commitMessage = execSync(
      'git log -1 --pretty=format:"%s%n%b"',
      { stdio: 'pipe' },
    )
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
    const out = execSync(
      'git diff-tree --no-commit-id --name-only -r HEAD',
      { stdio: 'pipe' },
    )
      .toString()
      .trim();

    if (!out) return null;

    const dirs = new Set<string>();
    for (const file of out.split('\n')) {
      const match = file.match(/^packages\/([^/]+)\/src\//);
      if (match) dirs.add(match[1]);
    }
    return dirs;
  } catch {
    return null;
  }
};

const findPublishablePackages = (): Array<{
  name: string;
  dir: string;
  packageJsonPath: string;
}> => {
  const packagesDir = resolve(process.cwd(), 'packages');
  const entries = readdirSync(packagesDir, {
    withFileTypes: true,
  });
  const packages: Array<{
    name: string;
    dir: string;
    packageJsonPath: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = join(
      packagesDir,
      entry.name,
      'package.json',
    );
    if (!existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(
      readFileSync(pkgJsonPath, 'utf-8'),
    );
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
  packages: Array<{
    name: string;
    dir: string;
    packageJsonPath: string;
  }>,
  bumpType: 'major' | 'minor' | 'patch',
): Array<{ packageJsonPath: string; dir: string }> => {
  const bumped: Array<{
    packageJsonPath: string;
    dir: string;
  }> = [];

  for (const { name, dir, packageJsonPath } of packages) {
    const pkg = JSON.parse(
      readFileSync(packageJsonPath, 'utf-8'),
    );
    const oldVersion = pkg.version;

    if (!oldVersion) {
      console.warn(
        `No version found in ${name}. Skipping.`,
      );
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
      writeFileSync(
        packageJsonPath,
        `${JSON.stringify(pkg, null, 2)}\n`,
      );
      bumped.push({ packageJsonPath, dir });
      console.log(
        `Bumped ${name} from ${oldVersion} to ${newVersion}`,
      );
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

  const pkg = JSON.parse(
    readFileSync(bumpedFiles[0], 'utf-8'),
  );
  const commitMessage = `chore(release): bump version to ${pkg.version} [skip ci]`;
  execSync(`git commit -m "${commitMessage}" --no-verify`);

  const branch =
    process.env.GITHUB_REF_NAME ??
    execSync('git branch --show-current').toString().trim();

  if (!branch) {
    throw new Error(
      'Unable to determine branch for pushing release commit.',
    );
  }

  console.log(`Pushing to branch: ${branch}`);
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    const repo =
      process.env.GITHUB_REPOSITORY ?? 'petarzarkov/arkv';
    execSync(
      `git push https://x-access-token:${token}@github.com/${repo}.git HEAD:refs/heads/${branch}`,
    );
  } else {
    execSync(`git push origin HEAD:refs/heads/${branch}`);
  }

  console.log(`Successfully pushed version ${pkg.version}`);
};

const publishPackage = (pkgDir: string): void => {
  execSync('bun publish --access public --no-git-checks', {
    cwd: pkgDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: process.env.HOME,
    },
  });
};

type PublishablePackage = {
  name: string;
  dir: string;
  packageJsonPath: string;
};

const isVersionPublished = (
  name: string,
  version: string,
): boolean => {
  try {
    const out = execSync(
      `bunx npm view ${name}@${version} version --json`,
      { stdio: 'pipe' },
    )
      .toString()
      .trim();
    return out.includes(version);
  } catch {
    return false;
  }
};

const runForcePublish = (
  packages: PublishablePackage[],
): void => {
  console.log(
    '\n--- FORCE PUBLISH MODE: publishing all packages at current versions ---\n',
  );

  if (packages.length === 0) {
    console.log('No publishable packages found.');
    process.exit(0);
  }

  for (const { name, dir, packageJsonPath } of packages) {
    const pkg = JSON.parse(
      readFileSync(packageJsonPath, 'utf-8'),
    );
    const { version } = pkg;

    if (isVersionPublished(name, version)) {
      console.log(
        `Skipping ${name}@${version}: already published.`,
      );
      continue;
    }

    if (isDryRun) {
      console.log(
        `[DRY RUN] Would publish ${name}@${version}`,
      );
      continue;
    }

    console.log(`Publishing ${name}@${version}...`);
    publishPackage(dir);
  }
};

const runVersionBump = (
  allPackages: PublishablePackage[],
): void => {
  const changedSrcPackages = getChangedSrcPackages();

  if (
    changedSrcPackages !== null &&
    changedSrcPackages.size === 0
  ) {
    console.log(
      'No src changes detected, skipping version bump.',
    );
    process.exit(0);
  }

  if (changedSrcPackages !== null) {
    console.log(
      `Detected src changes in: ${[...changedSrcPackages].join(', ')}`,
    );
  } else {
    console.log(
      'Could not determine changed packages, processing all.',
    );
  }

  const bumpType = determineBumpType();
  console.log(`Determined version bump type: ${bumpType}`);

  const publishablePackages =
    changedSrcPackages === null
      ? allPackages
      : allPackages.filter(pkg =>
          changedSrcPackages.has(basename(pkg.dir)),
        );

  if (publishablePackages.length === 0) {
    console.log('No publishable packages found.');
    process.exit(0);
  }

  const bumpedPackages = applyVersionBumps(
    publishablePackages,
    bumpType,
  );

  if (isDryRun || bumpedPackages.length === 0) return;

  console.log('Committing version changes...');
  pushVersionCommit(
    bumpedPackages.map(p => p.packageJsonPath),
  );

  console.log('Publishing bumped packages...');
  for (const { dir } of bumpedPackages) {
    console.log(`Publishing ${basename(dir)}...`);
    publishPackage(dir);
  }
};

(async () => {
  if (isDryRun) {
    console.log('\n--- DRY RUN MODE ENABLED ---\n');
  }

  const allPublishablePackages = findPublishablePackages();

  try {
    if (isForcePublish) {
      runForcePublish(allPublishablePackages);
    } else {
      runVersionBump(allPublishablePackages);
    }
  } catch (error) {
    console.error('Failed to process packages:', error);
    process.exit(1);
  }
})();
