# @arkv/timezones

[![coverage](https://petarzarkov.github.io/arkv/coverage-timezones.svg)](https://petarzarkov.github.io/arkv#timezones)
[![npm](https://img.shields.io/npm/v/%40arkv%2Ftimezones)](https://www.npmjs.com/package/%40arkv%2Ftimezones)
[![size](https://img.shields.io/npm/unpacked-size/%40arkv%2Ftimezones?label=size)](https://www.npmjs.com/package/%40arkv%2Ftimezones)
[![license](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

******

Automatically generated timezones from IANA DB [tzdata-latest.tar.gz](https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz)

- No runtime dependencies
- Weekly cron job to check for new IANA timezone data
- Works in both Node.js and the browser
- If you just need the json data - [timezones.json](https://github.com/petarzarkov/arkv/blob/main/packages/timezones/timezones.json)

The fields for each timezone object are as follows:

| Field Name       | Description                                                                                                    | Example Value             |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `tzCode`         | The standard IANA Time Zone Database identifier (tz tzCode).                                                     | `Europe/Sofia` |
| `label`          | A display string combining the `tzCode` and the recorded UTC offset.                                             | `Europe/Sofia (GMT+03:00)` |
| `utc`            | The UTC offset in `+HH:MM` or `-HH:MM` format, as recorded when the data was generated.                          | `+03:00` |
| `locationLabel`  | A human-readable name for the primary city or location associated with the timezone.                             | `Sofia` |
| `countryCodes`   | An array of `ISO 3166-1 alpha-2` country codes associated with this timezone.                                    | `['KI', ...]` |
| `geographicArea` | The continent or ocean region the timezone is located in.                                                       | `Europe` |
| `type`           | Indicates if the entry is a `Canonical` timezone or a `Link` (an alias) to another timezone.                     | `Canonical` or `Link` |
| `parent`         | (Present for `Link` types) The `tzCode` of the canonical timezone that this link points to.                      | `Europe/London` |
| `comments`       | (Optional) Additional notes from the IANA database.                                                            | `'Mountain (most areas)'` |
| `children`       | (Present for `Canonical` types) An array of `tzCode` values for the zones that are links pointing to this.       | `['EST5EDT', ...]` |
| `location`       | The raw location name used in the IANA database (e.g., the last part of the `tzCode` before underscores).         | `Sofia` |

Inspired by: [list of tz database in wikipedia](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

- **IANA DB Version**: 2026c
- **Updated**: Sun, 26 Jul 2026 09:58:26 GMT
- **Last Modified**: Wed, 08 Jul 2026 18:02:48 GMT
- **Number of zones**: 597
- **Zones**: [TIMEZONES.md](https://github.com/petarzarkov/arkv/blob/main/packages/timezones/TIMEZONES.md)
- **Files used from IANA DB**: `zone.tab, zone1970.tab, etcetera, backward`

******

## Overview

`@arkv/timezones` provides up-to-date information about timezones based on the IANA Time Zone Database. It carries richer detail per zone than most alternatives: type (`Canonical` or `Link`), children/parent, UTC offset, associated country codes, geographic area, location and label.

Whenever new IANA data is available, a new version of this package is automatically generated, tested and published to npm.

The package ships CommonJS, ES Modules and TypeScript definitions.

> Replaces the standalone [`iana-db-timezones`](https://www.npmjs.com/package/iana-db-timezones) package, which is deprecated. The API is unchanged — only the package name differs.

## Install

```bash
bun add @arkv/timezones
# or
npm install @arkv/timezones
```

## Usage

### Accessing the raw data

The raw timezone data is available as an object and as an ES6 `Map`.

```typescript
import tzdb from '@arkv/timezones';

console.log(tzdb.zones['Europe/Sofia']);
/*
// => {
//   tzCode: 'Europe/Sofia',
//   type: 'Canonical',
//   label: 'Europe/Sofia (GMT+03:00)',
//   countryCodes: [ 'BG' ],
//   location: 'Sofia',
//   locationLabel: 'Sofia',
//   geographicArea: 'Europe',
//   utc: '+03:00'
// }
*/

console.log(tzdb.map.get('America/New_York'));
/*
// => {
//   children: [ 'EST5EDT', 'US/Eastern' ],
//   comments: 'Eastern (most areas)',
//   countryCodes: [ 'US' ],
//   geographicArea: 'America',
//   label: 'America/New_York (GMT-04:00)',
//   location: 'New_York',
//   locationLabel: 'New York',
//   tzCode: 'America/New_York',
//   type: 'Canonical',
//   utc: '-04:00'
// }
*/
```

### Utility functions

Available both as named exports and on the default export.

#### `getZone(tzCode: TimezoneCode): Timezone | null`

Returns the timezone object for a given tzCode, or `null` if not found.

```typescript
import { getZone } from '@arkv/timezones';

getZone('Europe/Sofia'); // => { ... detailed zone object ... }
getZone('Invalid/Timezone'); // => null
```

#### `getZoneUTC(tzCode: TimezoneCode): string | null`

Returns the recorded UTC offset for a timezone in `+HH:MM` or `-HH:MM` format, or `null` if the zone or offset is not available.

```typescript
import { getZoneUTC } from '@arkv/timezones';

getZoneUTC('Europe/Sofia'); // => '+03:00'
getZoneUTC('Invalid/Timezone'); // => null
```

The offset is a snapshot taken when the data was generated, so for zones observing DST it reflects whichever side of the DST boundary the last generation ran on.

#### `getZoneISODate(tzCode: TimezoneCode): string | null`

Returns the ISO 8601 date-time string adjusted to the zone's recorded offset, or `null` if the zone or offset is not available. The format is `YYYY-MM-DDTHH:mm:ss.sss+HH:MM` or `YYYY-MM-DDTHH:mm:ss.sss-HH:MM`.

```typescript
import { getZoneISODate } from '@arkv/timezones';

getZoneISODate('Europe/Sofia'); // => '2025-05-12T08:25:49.322+03:00'
getZoneISODate('Invalid/Timezone'); // => null
```

### TypeScript

```typescript
import type {
  CanonicalTimezone,
  LinkTimezone,
  Timezone,
  TimezoneCode,
} from '@arkv/timezones';
import { getZone, IANA_TZDB_VERSION } from '@arkv/timezones';

console.log(IANA_TZDB_VERSION); // => '2026c'

const zone: Timezone | null = getZone('Europe/London');

// Narrow the zone and TypeScript will help you from here
if (zone?.type === 'Canonical') {
  console.log(zone.children);
}
```

`TimezoneCode` is a union of every zone identifier in the data, so lookups are checked at compile time.

## Regenerating the data

```bash
bun run --filter '@arkv/timezones' generate
```

The generator asks IANA for the archive with an `If-Modified-Since` header taken from `previous.json` and exits without writing anything when nothing changed. Set `FORCE_REVALIDATE=true` to skip that check.

## Full timezone list

Every supported timezone, grouped by geographic area: [TIMEZONES.md](https://github.com/petarzarkov/arkv/blob/main/packages/timezones/TIMEZONES.md).
