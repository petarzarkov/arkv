import timezones, { type TimezoneCode } from './timezones.js';
import type { Timezone } from './types.js';

export type { TimezoneCode } from './timezones.js';
export { IANA_TZDB_VERSION } from './timezones.js';
export * from './types.js';

// The casts keep the emitted declarations small — without them TypeScript inlines
// the literal type of every zone into the .d.ts.
const zones = timezones as Record<TimezoneCode, Timezone>;
const map = new Map(Object.entries(zones) as [TimezoneCode, Timezone][]);

/**
 * Returns zone by timezone tzCode
 * @param {TimezoneCode} tzCode The tz tzCode of the timezone (e.g., 'Europe/Sofia')
 * @example
 * ```js
 * getZone('Europe/Sofia')
 * // => {
 * //   countryCodes: ['BG'],
 * //   utc: '+03:00',
 * //   geographicArea: 'Europe',
 * //   location: 'Sofia',
 * //   locationLabel: 'Sofia',
 * //   tzCode: 'Europe/Sofia',
 * //   type: 'Canonical'
 * // }
 * ```
 */
export const getZone = (tzCode: TimezoneCode): Timezone | null =>
  map.get(tzCode) ?? null;

/**
 * Returns the UTC offset recorded for a timezone
 * @param {TimezoneCode} tzCode The tzCode of the timezone (e.g., 'Europe/Sofia')
 * @example getZoneUTC('Europe/Sofia') //=> '+03:00'
 */
export const getZoneUTC = (tzCode: TimezoneCode): string | null =>
  map.get(tzCode)?.utc ?? null;

/**
 * Returns the ISO date-time adjusted to the timezone offset.
 *
 * The format is `YYYY-MM-DDTHH:mm:ss.sss+HH:MM` or `YYYY-MM-DDTHH:mm:ss.sss-HH:MM`
 *
 * @param {TimezoneCode} tzCode The tzCode of the timezone (e.g., 'Europe/Sofia')
 * @example getZoneISODate('Europe/Sofia') //=> '2025-05-12T08:25:49.322+03:00'
 */
export const getZoneISODate = (tzCode: TimezoneCode): string | null => {
  const offset = getZoneUTC(tzCode);
  if (!offset) return null;

  const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, sign, hours, minutes] = match;
  const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
  const offsetMillis = totalMinutes * 60 * 1000 * (sign === '+' ? 1 : -1);

  const adjusted = new Date(Date.now() + offsetMillis);
  const iso = adjusted.toISOString().replace('Z', '');
  return `${iso}${offset}`;
};

export default {
  zones,
  map,
  getZone,
  getZoneUTC,
  getZoneISODate,
};
