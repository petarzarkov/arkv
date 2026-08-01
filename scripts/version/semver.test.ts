import { describe, expect, it } from 'bun:test';
import {
  bumpVersion,
  isBehindRegistry,
  maxVersion,
  resolveNextVersion,
} from './semver';

describe('bumpVersion', () => {
  it('bumps each level', () => {
    expect(bumpVersion('0.7.6', 'patch')).toBe('0.7.7');
    expect(bumpVersion('0.7.6', 'minor')).toBe('0.8.0');
    expect(bumpVersion('0.7.6', 'major')).toBe('1.0.0');
  });
});

describe('maxVersion', () => {
  it('returns null for a package with no releases', () => {
    expect(maxVersion([])).toBeNull();
  });

  it('compares by semver, not lexically', () => {
    expect(maxVersion(['0.9.0', '0.10.0', '0.8.2'])).toBe('0.10.0');
    expect(maxVersion(['1.0.0'])).toBe('1.0.0');
  });
});

describe('isBehindRegistry', () => {
  it('is false when nothing is published', () => {
    expect(isBehindRegistry('0.1.0', null)).toBe(false);
  });

  it('is false at the registry version and true below it', () => {
    expect(isBehindRegistry('0.8.0', '0.8.0')).toBe(false);
    expect(isBehindRegistry('0.8.1', '0.8.0')).toBe(false);
    expect(isBehindRegistry('0.7.6', '0.8.0')).toBe(true);
  });
});

describe('resolveNextVersion', () => {
  it('bumps from the local version when it is level with the registry', () => {
    expect(resolveNextVersion('0.7.6', 'patch', '0.7.6')).toBe('0.7.7');
    expect(resolveNextVersion('0.7.6', 'minor', '0.7.6')).toBe('0.8.0');
  });

  it('bumps from the local version when the package was never published', () => {
    expect(resolveNextVersion('0.0.1', 'patch', null)).toBe('0.0.2');
  });

  // The reported failure: a merge resolved packages/logger/package.json in favour of
  // the branch, dropping the released 0.8.0 back to 0.7.6. The next run bumped to
  // 0.7.7 and npm rejected it — "previously published version 0.8.0 is higher than
  // the new version 0.7.7" — failing the whole release job.
  it('bumps past the registry when the local package.json fell behind', () => {
    expect(resolveNextVersion('0.7.6', 'patch', '0.8.0')).toBe('0.8.1');
    expect(resolveNextVersion('0.7.6', 'minor', '0.8.0')).toBe('0.9.0');
    expect(resolveNextVersion('0.7.6', 'major', '0.8.0')).toBe('1.0.0');
  });

  // Landing exactly on the published version is the dangerous case: the
  // already-published guard would skip the publish and push a bump for changes that
  // never shipped, so it has to clear the registry instead.
  it('steps over a candidate that lands exactly on the published version', () => {
    expect(resolveNextVersion('0.7.6', 'patch', '0.7.7')).toBe('0.7.8');
    expect(resolveNextVersion('0.7.6', 'minor', '0.8.0')).toBe('0.9.0');
  });

  it('never returns a version at or below the registry', () => {
    for (const type of ['patch', 'minor', 'major'] as const) {
      expect(
        isBehindRegistry(resolveNextVersion('0.1.0', type, '2.5.9'), '2.5.9'),
      ).toBe(false);
    }
  });
});
