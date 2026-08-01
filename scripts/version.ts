import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  determineBumpType,
  getChangedSrcPackages,
  getForcePublishTarget,
  pushVersionCommit,
} from './version/git';
import {
  findPublishablePackages,
  type PublishablePackage,
} from './version/packages';
import {
  getPublishedMaxVersion,
  isVersionPublished,
  publishPackage,
} from './version/registry';
import {
  type BumpType,
  bumpVersion,
  isBehindRegistry,
  resolveNextVersion,
} from './version/semver';

const isDryRun = process.env.DRY_RUN === 'true';

const nextVersionFor = (
  name: string,
  current: string,
  bumpType: BumpType,
): string => {
  const publishedMax = getPublishedMaxVersion(name);
  const localBump = bumpVersion(current, bumpType);
  const next = resolveNextVersion(current, bumpType, publishedMax);

  if (next !== localBump) {
    console.warn(
      `${name}: local package.json is at ${current} but ${publishedMax} is already ` +
        `published — bumping to ${next} instead of ${localBump}.`,
    );
  }

  return next;
};

const applyVersionBumps = (
  packages: PublishablePackage[],
  bumpType: BumpType,
): { packageJsonPath: string; dir: string }[] => {
  const bumped: { packageJsonPath: string; dir: string }[] = [];

  for (const { name, dir, packageJsonPath } of packages) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const oldVersion = pkg.version;

    if (!oldVersion) {
      console.warn(`No version found in ${name}. Skipping.`);
      continue;
    }

    const newVersion = nextVersionFor(name, oldVersion, bumpType);
    pkg.version = newVersion;

    if (isDryRun) {
      console.log(
        `[DRY RUN] Would bump ${name} from ${oldVersion} to ${newVersion}`,
      );
      continue;
    }

    writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    bumped.push({ packageJsonPath, dir });
    console.log(`Bumped ${name} from ${oldVersion} to ${newVersion}`);
  }

  return bumped;
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

  // Bump pass: write every version bump before publishing anything, so a package
  // that depends on another bumped here resolves the new version, not the old one.
  for (const { name, dir, packageJsonPath } of filtered) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    let { version } = pkg;

    // Not just "already published": npm also rejects anything below the registry's
    // highest release, so a local version that fell behind needs a bump past it too.
    const publishedMax = getPublishedMaxVersion(name);

    if (
      isVersionPublished(name, version) ||
      isBehindRegistry(version, publishedMax)
    ) {
      const newVersion = resolveNextVersion(version, bumpType, publishedMax);
      console.log(
        `${name}@${version} cannot be published (registry is at ${publishedMax}), bumping to ${newVersion}`,
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

  for (const { name, dir, version } of toPublish) {
    console.log(`Publishing ${name}@${version}...`);
    publishPackage(dir);
  }

  if (bumpedFiles.length > 0) {
    console.log('Committing version changes...');
    pushVersionCommit(bumpedFiles);
  }
};

const runVersionBump = (allPackages: PublishablePackage[]): void => {
  const changedSrcPackages = getChangedSrcPackages();

  // Bailing out is the safe answer when git cannot tell us what moved. Bumping and
  // republishing every package instead — the old fallback — turned one unreadable
  // merge commit into eight unwanted releases.
  if (changedSrcPackages === null) {
    console.log(
      'Could not determine changed packages from git; skipping version bump. ' +
        'Use [force-publish] or [force-publish:<pkg>] to publish anyway.',
    );
    process.exit(0);
  }

  if (changedSrcPackages.size === 0) {
    console.log('No src changes detected, skipping version bump.');
    process.exit(0);
  }

  console.log(`Detected src changes in: ${[...changedSrcPackages].join(', ')}`);

  const bumpType = determineBumpType();
  console.log(`Determined version bump type: ${bumpType}`);

  const publishablePackages = allPackages.filter((pkg) =>
    changedSrcPackages.has(basename(pkg.dir)),
  );

  if (publishablePackages.length === 0) {
    console.log('No publishable packages found.');
    process.exit(0);
  }

  const bumpedPackages = applyVersionBumps(publishablePackages, bumpType);

  if (isDryRun || bumpedPackages.length === 0) return;

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
  pushVersionCommit(bumpedPackages.map((p) => p.packageJsonPath));
};

void (async () => {
  if (isDryRun) {
    console.log('\n--- DRY RUN MODE ENABLED ---\n');
  }

  const allPublishablePackages = findPublishablePackages();
  const forcePublish = getForcePublishTarget();

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
