import { execSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const isDryRun = process.env.DRY_RUN === 'true';

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
      {
        stdio: 'pipe',
      },
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

(async () => {
  if (isDryRun) {
    console.log('\n--- DRY RUN MODE ENABLED ---\n');
  }

  const bumpType = determineBumpType();
  console.log(`Determined version bump type: ${bumpType}`);

  const publishablePackages = findPublishablePackages();

  if (publishablePackages.length === 0) {
    console.log('No publishable packages found.');
    process.exit(0);
  }

  const bumpedFiles: string[] = [];

  for (const {
    name,
    packageJsonPath,
  } of publishablePackages) {
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
    pkg.version = newVersion;

    if (!isDryRun) {
      writeFileSync(
        packageJsonPath,
        `${JSON.stringify(pkg, null, 2)}\n`,
      );
      bumpedFiles.push(packageJsonPath);
      console.log(
        `Bumped ${name} from ${oldVersion} to ${newVersion}`,
      );
    } else {
      console.log(
        `[DRY RUN] Would bump ${name} from ${oldVersion} to ${newVersion}`,
      );
    }
  }

  if (!isDryRun && bumpedFiles.length > 0) {
    try {
      console.log('Committing version changes...');
      execSync(`git add ${bumpedFiles.join(' ')}`);

      const pkg = JSON.parse(
        readFileSync(bumpedFiles[0], 'utf-8'),
      );
      const commitMessage = `chore(release): bump version to ${pkg.version} [skip ci]`;
      execSync(
        `git commit -m "${commitMessage}" --no-verify`,
      );

      const branch =
        process.env.GITHUB_REF_NAME ??
        execSync('git branch --show-current')
          .toString()
          .trim();

      if (!branch) {
        throw new Error(
          'Unable to determine branch for pushing release commit.',
        );
      }

      console.log(`Pushing to branch: ${branch}`);
      const token = process.env.GITHUB_TOKEN;
      if (token) {
        const repo =
          process.env.GITHUB_REPOSITORY ??
          'petarzarkov/arkv';
        execSync(
          `git push https://x-access-token:${token}@github.com/${repo}.git HEAD:refs/heads/${branch}`,
        );
      } else {
        execSync(
          `git push origin HEAD:refs/heads/${branch}`,
        );
      }
      console.log(
        `Successfully pushed version ${pkg.version}`,
      );
    } catch (error) {
      console.error('Failed to version packages:', error);
      process.exit(1);
    }
  }
})();
