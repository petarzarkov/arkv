import { semver } from 'bun';

export type BumpType = 'major' | 'minor' | 'patch';

export const bumpVersion = (version: string, type: BumpType): string => {
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

/** npm refuses the implicit `latest` tag for anything below the highest release. */
export const isBehindRegistry = (
  version: string,
  publishedMax: string | null,
): boolean =>
  publishedMax !== null && semver.order(version, publishedMax) === -1;

export const maxVersion = (versions: string[]): string | null =>
  versions.reduce<string | null>(
    (max, version) =>
      max === null || semver.order(version, max) === 1 ? version : max,
    null,
  );

/**
 * A local package.json can sit *behind* the registry — a merge that resolves a
 * version conflict in favour of the branch, a revert, a stale checkout. Bumping from
 * it then yields a version npm rejects outright ("previously published version X is
 * higher than the new version Y"), failing the release. So the registry is the floor:
 * unless the local bump lands strictly above it, bump from the published version.
 *
 * Strictly above, because landing *on* the published version would make the
 * already-published guard skip the publish and push a bump for changes that never
 * shipped. The cost is that a rerun after a publish that succeeded but whose push
 * failed republishes identical content one version higher, which is harmless.
 */
export const resolveNextVersion = (
  current: string,
  type: BumpType,
  publishedMax: string | null,
): string => {
  const candidate = bumpVersion(current, type);

  if (publishedMax === null || semver.order(candidate, publishedMax) === 1) {
    return candidate;
  }

  return bumpVersion(publishedMax, type);
};
