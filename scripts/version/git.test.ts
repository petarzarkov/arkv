import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { extractCommitType, getChangedSrcPackages } from './git';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

let repo: string;

const git = (command: string): string =>
  execSync(`git ${command}`, { cwd: repo, stdio: 'pipe', env: GIT_ENV })
    .toString()
    .trim();

const write = (relativePath: string, contents: string): void => {
  const target = join(repo, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
};

const pkgJson = (name: string, version: string): string =>
  `${JSON.stringify({ name: `@arkv/${name}`, version }, null, 2)}\n`;

const commit = (message: string): string => {
  git('add -A');
  git(`commit -q --no-verify -m "${message}"`);
  return git('rev-parse HEAD');
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'arkv-version-'));
  git('init -q -b main');
  write('packages/logger/package.json', pkgJson('logger', '0.7.6'));
  write('packages/logger/src/logger.ts', 'export const log = () => {};\n');
  write('packages/shared/package.json', pkgJson('shared', '0.7.4'));
  write('scripts/version.ts', '// noop\n');
  commit('chore: init');
});

afterEach(() => {
  delete process.env.GITHUB_EVENT_BEFORE;
  rmSync(repo, { recursive: true, force: true });
});

describe('extractCommitType', () => {
  it('reads the type off a plain and a squashed-merge message', () => {
    expect(extractCommitType('feat: add thing')).toBe('feat');
    expect(extractCommitType('fix(logger): stderr (#12)')).toBe('fix');
    expect(
      extractCommitType('Merge pull request #3 from x\n\nfeat: add thing'),
    ).toBe('feat');
    expect(extractCommitType('Merge branch of github.com/x/y')).toBeNull();
  });
});

describe('getChangedSrcPackages', () => {
  it('detects packages touched by an ordinary commit', () => {
    write('packages/logger/src/logger.ts', 'export const log = () => 1;\n');
    commit('fix: logger');

    expect([...getChangedSrcPackages(repo)!]).toEqual(['logger']);
  });

  it('reports nothing when only non-package files changed', () => {
    write('scripts/version.ts', '// changed\n');
    commit('chore: scripts');

    expect(getChangedSrcPackages(repo)?.size).toBe(0);
  });

  // The reported failure: CI's release commit landed on main while local work was in
  // flight, so the push was a merge commit. `git diff-tree` prints an empty diff for a
  // merge, which the script read as "cannot tell what changed" and answered by bumping
  // and republishing every package in the monorepo.
  describe('merge commit', () => {
    const buildMergeScenario = (): string => {
      // Release commit on the remote: bumps versions only.
      const base = git('rev-parse HEAD');
      write('packages/logger/package.json', pkgJson('logger', '0.8.0'));
      write('packages/shared/package.json', pkgJson('shared', '0.8.0'));
      const release = commit('chore(release): bump version to 0.8.0 [skip ci]');

      // Local work branched off before that release commit.
      git(`checkout -q -b local ${base}`);
      write('packages/logger/src/logger.ts', 'export const log = () => 2;\n');
      commit('chore: logger rework');

      git(`merge -q --no-ff -m "Merge branch main" ${release}`);
      return release;
    };

    it('sees the real changes instead of an empty diff', () => {
      buildMergeScenario();

      const changed = getChangedSrcPackages(repo);

      expect(changed).not.toBeNull();
      expect(changed!.has('logger')).toBe(true);
    });

    it('limits the diff to the push range when the push event provides one', () => {
      const release = buildMergeScenario();
      process.env.GITHUB_EVENT_BEFORE = release;

      // shared only moved in the release commit that was merged in, so it must not
      // count as changed by this push.
      expect([...getChangedSrcPackages(repo)!]).toEqual(['logger']);
    });

    it('ignores a push base that is unknown or the new-branch zero SHA', () => {
      buildMergeScenario();

      process.env.GITHUB_EVENT_BEFORE = '0'.repeat(40);
      expect(getChangedSrcPackages(repo)?.has('logger')).toBe(true);

      process.env.GITHUB_EVENT_BEFORE = 'f'.repeat(40);
      expect(getChangedSrcPackages(repo)?.has('logger')).toBe(true);
    });
  });

  it('returns null when the directory is not a git repository', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'arkv-nogit-'));
    try {
      expect(getChangedSrcPackages(notARepo)).toBeNull();
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});
