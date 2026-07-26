export interface BaseTimezone {
  /**
   * The standard IANA Time Zone Database identifier (e.g., `Asia/Taipei`, `Europe/London`).
   */
  tzCode: string;
  /**
   * Indicates if the entry is a `Canonical` timezone or a `Link` (an alias) to another timezone.
   */
  type: 'Canonical' | 'Link';
  /**
   * A display string containing the tzCode followed by the UTC offset (e.g., `Asia/Taipei (GMT+08:00)`).
   */
  label: string;
  /**
   * An array of `ISO 3166-1 alpha-2` country codes associated with this timezone (e.g. `['KI','MH','TV','UM','WF']`)
   */
  countryCodes?: string[];
  /**
   * The continent or ocean region the timezone is located in (e.g., `Europe`, `Pacific`).
   */
  geographicArea: string | null;
  /**
   * The raw location name used in the IANA database (often the same as the last part of the tzCode, but can differ).
   */
  location: string | null;
  /**
   * A human-readable name for the primary city or location associated with the timezone (e.g., `Taipei`, `London`).
   */
  locationLabel: string | null;
  /**
   * (Optional) Additional notes about the zone.
   */
  comments?: string;
  /**
   * The UTC offset in `+HH:MM` or `-HH:MM` format (e.g., `+08:00`), as it was when this data
   * was generated — it therefore includes Daylight Saving Time for zones observing it at that
   * point, and is a snapshot rather than a live value.
   */
  utc: string | null;
}

export interface CanonicalTimezone extends BaseTimezone {
  type: 'Canonical';
  /**
   * (Present for Canonical types) An array of tzCode values for the zones that are links pointing to this canonical zone.
   */
  children?: string[];
}

export interface LinkTimezone extends BaseTimezone {
  type: 'Link';
  /**
   * (Present for Link types) The tzCode of the canonical timezone that this link points to.
   */
  parent: string | null;
}

export type Timezone = CanonicalTimezone | LinkTimezone;
