import { readFileSync, writeFileSync } from 'node:fs';
import { paths } from './paths.js';
import type { ParsedData } from './parse-data.js';

const SEPARATOR = '******';
const REPO_BLOB =
  'https://github.com/petarzarkov/arkv/blob/main/packages/timezones';
const EXAMPLE_ZONE = 'Europe/Sofia';

/**
 * Replaces the block between the two `******` separators in README.md with the
 * freshly generated stats. Everything outside that block is hand-written.
 */
export const updateReadmeHeader = (parsedData: ParsedData): void => {
  const example = parsedData.zones[EXAMPLE_ZONE];
  if (!example) {
    throw new Error(`Example zone ${EXAMPLE_ZONE} missing from parsed data`);
  }

  const fieldsTable = `The fields for each timezone object are as follows:

| Field Name       | Description                                                                                                    | Example Value             |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- |
| \`tzCode\`         | The standard IANA Time Zone Database identifier (tz tzCode).                                                     | \`${example.tzCode}\` |
| \`label\`          | A display string combining the \`tzCode\` and the recorded UTC offset.                                             | \`${example.label}\` |
| \`utc\`            | The UTC offset in \`+HH:MM\` or \`-HH:MM\` format, as recorded when the data was generated.                          | \`${example.utc}\` |
| \`locationLabel\`  | A human-readable name for the primary city or location associated with the timezone.                             | \`${example.locationLabel}\` |
| \`countryCodes\`   | An array of \`ISO 3166-1 alpha-2\` country codes associated with this timezone.                                    | \`['KI', ...]\` |
| \`geographicArea\` | The continent or ocean region the timezone is located in.                                                       | \`${example.geographicArea}\` |
| \`type\`           | Indicates if the entry is a \`Canonical\` timezone or a \`Link\` (an alias) to another timezone.                     | \`Canonical\` or \`Link\` |
| \`parent\`         | (Present for \`Link\` types) The \`tzCode\` of the canonical timezone that this link points to.                      | \`Europe/London\` |
| \`comments\`       | (Optional) Additional notes from the IANA database.                                                            | \`'Mountain (most areas)'\` |
| \`children\`       | (Present for \`Canonical\` types) An array of \`tzCode\` values for the zones that are links pointing to this.       | \`['EST5EDT', ...]\` |
| \`location\`       | The raw location name used in the IANA database (e.g., the last part of the \`tzCode\` before underscores).         | \`${example.location}\` |`;

  const header = `${SEPARATOR}

Automatically generated timezones from IANA DB [tzdata-latest.tar.gz](https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz)

- No runtime dependencies
- Weekly cron job to check for new IANA timezone data
- Works in both Node.js and the browser
- If you just need the json data - [timezones.json](${REPO_BLOB}/timezones.json)

${fieldsTable}

Inspired by: [list of tz database in wikipedia](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

- **IANA DB Version**: ${parsedData.version}
- **Updated**: ${parsedData.updatedAt}
- **Last Modified**: ${parsedData.lastModified}
- **Number of zones**: ${parsedData.numberOfZones}
- **Zones**: [TIMEZONES.md](${REPO_BLOB}/TIMEZONES.md)
- **Files used from IANA DB**: \`${parsedData.filesUsed.join(', ')}\`

${SEPARATOR}`;

  const current = readFileSync(paths.readme, 'utf8');
  const firstStart = current.indexOf(SEPARATOR);
  const secondStart = current.indexOf(SEPARATOR, firstStart + SEPARATOR.length);

  if (firstStart === -1 || secondStart === -1) {
    throw new Error(
      `Could not find the two "${SEPARATOR}" separators in README.md`,
    );
  }

  writeFileSync(
    paths.readme,
    `${current.slice(0, firstStart)}${header}${current.slice(secondStart + SEPARATOR.length)}`,
  );
};
