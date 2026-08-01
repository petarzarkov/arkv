import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { BumpType } from './semver';

const CHANGED_PACKAGE_PATH =
  /^packages\/([^/]+)\/(src\/|frontend\/src\/|package\.json|README\.md)/;

const git = (command: string, cwd?: string): string =>
  execSync(command, { stdio: 'pipe', cwd }).toString().trim();

const parseScopes = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const getForcePublishTarget = (): {
  force: boolean;
  packages: string[] | null;
} => {
  const envForce = process.env.FORCE_PUBLISH;
  if (envForce === 'true') return { force: true, packages: null };
  if (envForce && envForce !== 'false')
    return { force: true, packages: parseScopes(envForce) };

  try {
    const commitMessage = git('git log -1 --pretty=format:"%s%n%b"');

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

export const extractCommitType = (message: string): string | null => {
  // Handle squashed merge commits: "Merge pull request #123 from branch\n\nfeat: message"
  // or "feat(scope): message (#123)"
  const mergeMatch = message.match(
    /(?:Merge.*?\n\n?)?(?:^|\n)(feat|fix|chore|docs|test|style|refactor|perf|build|ci|revert|security|sync)(?:\([^)]+\))?(!)?: /m,
  );

  return mergeMatch ? mergeMatch[1] : null;
};

export const determineBumpType = (): BumpType => {
  try {
    const commitMessage = git('git log -1 --pretty=format:"%s%n%b"');

    if (
      commitMessage.includes('!:') ||
      commitMessage.includes('BREAKING CHANGE')
    ) {
      return 'major';
    }

    return extractCommitType(commitMessage) === 'feat' ? 'minor' : 'patch';
  } catch (error) {
    console.warn(
      'Could not determine bump type from commit message, defaulting to patch',
      error,
    );
    return 'patch';
  }
};

/**
 * The SHA the branch pointed at before this push. Diffing against it is the only
 * accurate answer for a merge commit: `git diff-tree` prints nothing at all for a
 * merge, and a first-parent diff also reports whatever the merge pulled in from the
 * other side — typically the previous release's version bumps, which would republish
 * packages that did not actually change.
 */
const getPushBase = (cwd?: string): string | null => {
  const before = process.env.GITHUB_EVENT_BEFORE;
  // The all-zero SHA is what a push event carries for a newly created branch.
  if (!before || !/^[0-9a-f]{7,40}$/.test(before) || /^0+$/.test(before))
    return null;

  try {
    git(`git cat-file -e ${before}^{commit}`, cwd);
    return before;
  } catch {
    return null;
  }
};

export const getChangedFiles = (cwd?: string): string[] | null => {
  try {
    const base = getPushBase(cwd);
    const out = base
      ? git(`git diff --name-only ${base} HEAD`, cwd)
      : // `-m --first-parent` is what makes a merge commit diff against the branch
        // it was merged into rather than printing an empty diff.
        git(
          'git diff-tree --no-commit-id --name-only -r -m --first-parent HEAD',
          cwd,
        );

    return out ? out.split('\n') : [];
  } catch {
    return null;
  }
};

/** `null` means git could not answer — not "nothing changed". */
export const getChangedSrcPackages = (cwd?: string): Set<string> | null => {
  const files = getChangedFiles(cwd);
  if (files === null) return null;

  const dirs = new Set<string>();
  for (const file of files) {
    const match = file.match(CHANGED_PACKAGE_PATH);
    if (match) dirs.add(match[1]);
  }

  return dirs;
};

export const pushVersionCommit = (bumpedFiles: string[]): void => {
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
