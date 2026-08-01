import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import { withResolvedWorkspaceDeps } from './packages';
import { maxVersion } from './semver';

// Trusted publishing needs npm >= 11.5.1, and GitHub's ubuntu-latest image still
// ships npm 10.x. `bunx` fetches this exact version and runs it on bun's own
// runtime, so no Node install is needed anywhere in CI.
export const NPM = 'bunx npm@11.10.1';

const versionCache = new Map<string, string[]>();

/** Empty for a package that has never been published, or if npm is unreachable. */
const publishedVersions = (name: string): string[] => {
  const cached = versionCache.get(name);
  if (cached) return cached;

  let versions: string[] = [];
  try {
    const out = execSync(`${NPM} view ${name} versions --json`, {
      stdio: 'pipe',
    })
      .toString()
      .trim();
    // npm returns a single quoted string when only one version exists,
    // or a JSON array when multiple versions exist
    const parsed: string | string[] = JSON.parse(out);
    versions = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    versions = [];
  }

  versionCache.set(name, versions);
  return versions;
};

export const isVersionPublished = (name: string, version: string): boolean =>
  publishedVersions(name).includes(version);

export const getPublishedMaxVersion = (name: string): string | null =>
  maxVersion(publishedVersions(name));

/**
 * Publishes with npm rather than bun: authentication happens through npm's OIDC
 * trusted publishing, which `bun publish` does not implement (oven-sh/bun#15601).
 *
 * `--provenance` only works on a supported CI, so it is left off local runs.
 */
export const publishPackage = (pkgDir: string): void => {
  const provenance = process.env.GITHUB_ACTIONS ? ' --provenance' : '';

  withResolvedWorkspaceDeps(pkgDir, () => {
    try {
      execSync(`${NPM} publish --access public${provenance}`, {
        cwd: pkgDir,
        stdio: 'inherit',
      });
    } catch (error) {
      // Trusted publishing needs the package to have a trusted publisher pointing
      // at this repo + workflow, and the job needs `id-token: write`. npm answers
      // a PUT it won't authorize with 404 rather than 401/403, so an unhelpful
      // "404 Not Found" here is almost always missing/mismatched config.
      console.error(
        `\nPublish failed for ${basename(pkgDir)}. If this is a 404/E404, check the ` +
          `npm trusted publisher for this package: it must point at ` +
          `${process.env.GITHUB_REPOSITORY ?? 'petarzarkov/arkv'} and the workflow ` +
          `file that runs this script. A package that has never been published ` +
          `needs one manual publish before a trusted publisher can be attached.\n`,
      );
      throw error;
    }
  });
};
