import { statSync, writeFileSync } from 'node:fs';
import { inspect } from 'node:util';
import { emitTimezonesMarkdown } from './emit-timezones-md.js';
import { fetchData } from './fetch-data.js';
import { logger } from './logger.js';
import { parseData } from './parse-data.js';
import { paths } from './paths.js';
import { updateReadmeHeader } from './update-readme-header.js';

const emitTimezonesModule = (
  zones: Record<string, unknown>,
  version: string,
): string => {
  const codes = Object.keys(zones)
    .map((tz) => `"${tz}"`)
    .join(', ');
  const literal = inspect(zones, {
    depth: null,
    compact: true,
    breakLength: undefined,
  });

  return `import type { Timezone } from "./types.js";

const timezoneCodes = [${codes}] as const;
export type TimezoneCode = typeof timezoneCodes[number];
export const IANA_TZDB_VERSION = ${JSON.stringify(version)} as const;
const timezones: Record<TimezoneCode, Timezone> = ${literal};
export default timezones;
`;
};

const startTs = Date.now();

const latestData = await fetchData({
  filesToExtract: ['zone.tab', 'zone1970.tab', 'etcetera', 'backward'],
});

if (!latestData) {
  logger.info('Nothing to generate');
  process.exit(0);
}

const parsedData = parseData(latestData);

logger.debug('Generating src/timezones.ts...');
writeFileSync(
  paths.timezonesModule,
  emitTimezonesModule(parsedData.zones, parsedData.version),
);

logger.debug('Generating TIMEZONES.md...');
emitTimezonesMarkdown(parsedData);

logger.debug('Updating README.md...');
updateReadmeHeader(parsedData);

logger.debug('Generating timezones.json...');
writeFileSync(paths.timezonesJson, JSON.stringify(parsedData, null, 2));

writeFileSync(
  paths.previousJson,
  JSON.stringify({ lastModified: parsedData.lastModified }, null, 2),
);

logger.info('Generated IANA timezone data', {
  tzdbVersion: parsedData.version,
  zones: parsedData.numberOfZones,
  timezonesModuleKb: Math.round(statSync(paths.timezonesModule).size / 1024),
  tookMs: Date.now() - startTs,
});
