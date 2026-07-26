import { describe, expect, test } from 'bun:test';
import tzdb, {
  getZone,
  getZoneISODate,
  getZoneUTC,
  IANA_TZDB_VERSION,
  type CanonicalTimezone,
  type Timezone,
  type TimezoneCode,
} from './index.js';

const zones = Object.keys(tzdb.zones) as TimezoneCode[];

describe('@arkv/timezones', () => {
  test('exposes the tzdb version it was generated from', () => {
    expect(IANA_TZDB_VERSION).toMatch(/^\d{4}[a-z]$/);
  });

  test('named and default exports are the same functions', () => {
    expect(tzdb.getZone).toBe(getZone);
    expect(tzdb.getZoneUTC).toBe(getZoneUTC);
    expect(tzdb.getZoneISODate).toBe(getZoneISODate);
  });

  test('unknown zone', () => {
    expect(getZone('unknown' as TimezoneCode)).toBeNull();
    expect(getZoneISODate('unknown' as TimezoneCode)).toBeNull();
    expect(getZoneUTC('unknown' as TimezoneCode)).toBeNull();
  });

  test('unparsable offset', () => {
    tzdb.map.set('bad-offset' as TimezoneCode, {
      comments: 'Aysén Region',
      countryCodes: ['CL'],
      utc: 'bad',
      geographicArea: 'America',
      location: 'Coyhaique',
      locationLabel: 'Coyhaique',
      tzCode: 'America/Coyhaique',
      label: 'some label',
      type: 'Canonical',
    });

    expect(getZoneISODate('bad-offset' as TimezoneCode)).toBeNull();
    tzdb.map.delete('bad-offset' as TimezoneCode);
  });

  test('every zone resolves, is labelled and links back to its parent', () => {
    for (const zoneName of zones) {
      const zone = getZone(zoneName) as Timezone;
      expect(zone).toBeDefined();
      expect(zone.label).toEqual(`${zoneName} (GMT${zone.utc})`);

      if (zone.type === 'Link') {
        expect(zone.parent).toBeDefined();
        const parentZone = getZone(
          zone.parent as TimezoneCode,
        ) as CanonicalTimezone;
        expect(parentZone.type).toEqual('Canonical');
        if (parentZone.children) {
          expect(parentZone.children).toContain(zoneName);
        }
      }
    }
  });

  test('every offset is well formed and yields an ISO date', () => {
    for (const zoneName of zones) {
      const utc = getZoneUTC(zoneName);
      if (!utc) continue;

      expect(utc).toMatch(/^([+-])(\d{2}):(\d{2})$/);
      const [, sign, hours, minutes] = utc.match(
        /^([+-])(\d{2}):(\d{2})$/,
      ) as RegExpMatchArray;
      expect(parseInt(hours)).toBeLessThanOrEqual(23);
      expect(parseInt(minutes)).toBeLessThanOrEqual(59);

      const now = Date.now();
      const isoDateString = getZoneISODate(zoneName);
      expect(isoDateString).toBeDefined();

      const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
      const offsetMillis = totalMinutes * 60 * 1000 * (sign === '+' ? 1 : -1);
      const iso = new Date(now + offsetMillis).toISOString().replace('Z', '');
      expect(new Date(isoDateString!).getTime()).toBeGreaterThanOrEqual(
        new Date(`${iso}${utc}`).getTime(),
      );
    }
  });
});
