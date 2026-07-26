import { join, resolve } from 'node:path';

const PACKAGE_ROOT = resolve(import.meta.dir, '..');

export const paths = {
  timezonesModule: join(PACKAGE_ROOT, 'src', 'timezones.ts'),
  timezonesJson: join(PACKAGE_ROOT, 'timezones.json'),
  timezonesMarkdown: join(PACKAGE_ROOT, 'TIMEZONES.md'),
  previousJson: join(PACKAGE_ROOT, 'previous.json'),
  readme: join(PACKAGE_ROOT, 'README.md'),
};
