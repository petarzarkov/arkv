# @arkv/temporal

> The zero-timezone-bug drop-in replacement for Day.js.
> Keep your exact same chainable API. Swap the engine to the modern, native JavaScript **Temporal** API.

---

## The Problem

JavaScript's `Date` object is broken by design — and most of the popular date libraries (Day.js, Moment.js) are built on top of it. That means they inherit all the same fundamental bugs:

### What `Date` gets wrong

**1. Timezone traps**
`Date` only understands two timezones: UTC and "whatever the machine is set to". There is no way to work with an arbitrary named timezone without a third-party dataset and manual offset arithmetic.

```js
// Day.js — no timezone support in core
dayjs('2024-03-10').add(1, 'day').format('YYYY-MM-DD')
// Returns '2024-03-11' ✓ — but only because it avoids the DST edge
// On the night of a DST "spring forward", adding 1 "day" adds 23 hours.
// "23 hours later" is not "tomorrow".
```

**2. Mutable state leaking through**
`Date` methods like `setMonth()` mutate in place. Libraries paper over this with cloning, but bugs still slip through.

**3. Month indexing insanity**
`new Date(2024, 0, 1)` is January 1st. January is month `0`. December is month `11`. This is a design decision from 1995 that has confused every JavaScript developer since.

**4. String parsing is implementation-defined**
`new Date('2024-03-07')` returns midnight UTC on some runtimes and midnight local time on others.

**5. No sub-millisecond precision**
`Date` is capped at millisecond precision. Modern systems need microsecond and nanosecond timestamps.

---

## The Solution: Temporal

The **TC39 Temporal proposal** is a complete, ground-up redesign of date and time in JavaScript. It solves every one of the problems above:

- ✅ **Named timezone support** built in — `Temporal.ZonedDateTime` always carries its timezone
- ✅ **Immutable by design** — every operation returns a new object
- ✅ **Calendar-aware arithmetic** — adding 1 month to January 31st gives February 28th, not March 3rd
- ✅ **DST-safe** — adding "1 day" moves the wall clock by exactly 1 day, even across DST boundaries
- ✅ **Nanosecond precision** — `epochNanoseconds` returns a `BigInt`
- ✅ **Explicit timezone handling** — you cannot accidentally ignore a timezone

### But Temporal is verbose

The Temporal API is incredibly powerful. It is also incredibly verbose:

```js
// Temporal — correct but exhausting
Temporal.Now.plainDateISO().toString()
// vs
dayjs().format('YYYY-MM-DD')

// Temporal — adding 1 month
Temporal.Now.zonedDateTimeISO().add({ months: 1 }).toPlainDate().toString()
// vs
dayjs().add(1, 'month').format('YYYY-MM-DD')
```

Nobody wants to rewrite 10,000 lines of clean `dayjs().format('YYYY-MM-DD')` code into Temporal's multi-step API.

---

## What `@arkv/temporal` Does

`@arkv/temporal` is an **adapter**. It exposes the **exact same chainable API as Day.js**, but maintains a `Temporal.ZonedDateTime` internally instead of a `Date`. You get:

- The **DX of Day.js** — same methods, same chaining, same format tokens
- The **correctness of Temporal** — timezone safety, DST-aware arithmetic, nanosecond timestamps
- **Zero code changes** for the vast majority of use cases

```js
// Before — Day.js with Date underneath
import dayjs from 'dayjs'
dayjs('2026-03-07').add(1, 'month').format('YYYY-MM-DD')

// After — @arkv/temporal with Temporal underneath
import tdayjs from '@arkv/temporal'
tdayjs('2026-03-07').add(1, 'month').format('YYYY-MM-DD')
// API is identical. The engine is not.
```

---

## Installation

```sh
npm install @arkv/temporal
# or
bun add @arkv/temporal
```

> **Note:** The Temporal API is not yet available natively in all runtimes (Bun, older Node.js). This package automatically installs and imports [`temporal-polyfill`](https://github.com/fullcalendar/temporal-polyfill) to fill the gap. No configuration required.

---

## Quick Start

```ts
import tdayjs from '@arkv/temporal'

// Current time
tdayjs()

// Parse a date string
tdayjs('2026-03-07')
tdayjs('2026-03-07T10:30:00')
tdayjs('2026-03-07T10:30:00+05:00')
tdayjs('2026-03-07T10:30:00[America/New_York]')

// Parse a unix timestamp (milliseconds)
tdayjs(1741305600000)

// Parse a native Date
tdayjs(new Date())

// Clone another instance
tdayjs(tdayjs())

// Unix seconds
tdayjs.unix(1741305600)

// Invalid date (dayjs-compatible)
tdayjs(null).isValid() // false
```

---

## API Reference

All methods are identical to Day.js unless explicitly noted. For detailed documentation, refer to the [Day.js docs](https://day.js.org/docs/en/parse/parse).

### Parsing

| Input | Behavior |
|-------|----------|
| `undefined` / no argument | Current local time |
| `null` | Invalid date |
| `number` | Unix timestamp in **milliseconds** |
| `string` (date only) | e.g. `'2026-03-07'` — midnight local time |
| `string` (datetime) | e.g. `'2026-03-07T10:30:00'` — local time |
| `string` (with offset) | e.g. `'2026-03-07T10:30:00+05:00'` — instant, displayed in local tz |
| `string` (with annotation) | e.g. `'2026-03-07T10:30:00[Europe/London]'` — full ZonedDateTime |
| `Date` | Native JS Date |
| `TDayjs` | Clones the instance |

### Display / Validity

```ts
tdayjs().isValid()           // true
tdayjs(null).isValid()       // false
tdayjs().clone()             // new identical instance
```

### Getters

```ts
const d = tdayjs('2026-03-07T10:30:45.123')

d.year()        // 2026
d.month()       // 2  ← 0-indexed (0 = January, 11 = December)
d.date()        // 7  ← day of month (1–31)
d.day()         // 6  ← day of week (0 = Sunday, 6 = Saturday)
d.hour()        // 10
d.minute()      // 30
d.second()      // 45
d.millisecond() // 123

// Generic getter
d.get('year')   // 2026
d.get('month')  // 2
```

> **Note on `month()`:** Like Day.js, months are **0-indexed**. January = `0`, December = `11`. Internally, Temporal uses 1-indexed months — the conversion is handled automatically.

### Setters

All setters return a **new instance**. The original is never modified.

```ts
tdayjs('2026-03-07').year(2030)         // → 2030-03-07
tdayjs('2026-03-07').month(0)           // → 2026-01-07  (January)
tdayjs('2026-03-07').month(11)          // → 2026-12-07  (December)
tdayjs('2026-03-07').date(15)           // → 2026-03-15
tdayjs('2026-03-07').hour(9)            // → 2026-03-07T09:xx:xx
tdayjs('2026-03-07').minute(0)
tdayjs('2026-03-07').second(0)
tdayjs('2026-03-07').millisecond(0)

// Generic setter
tdayjs('2026-03-07').set('year', 2030)
tdayjs('2026-03-07').set('month', 5)    // June
```

### Add / Subtract

```ts
// Supported units (case-insensitive, singular/plural/short all work)
// 'year' | 'years' | 'y'
// 'month' | 'months' | 'M'
// 'quarter' | 'quarters' | 'Q'   ← native, no plugin needed
// 'week' | 'weeks' | 'w'
// 'day' | 'days' | 'd'
// 'hour' | 'hours' | 'h'
// 'minute' | 'minutes' | 'm'
// 'second' | 'seconds' | 's'
// 'millisecond' | 'milliseconds' | 'ms'

tdayjs('2026-03-07').add(1, 'day')       // 2026-03-08
tdayjs('2026-01-31').add(1, 'month')     // 2026-02-28 (clamped, not March 3)
tdayjs('2026-03-07').add(1, 'year')      // 2027-03-07
tdayjs('2026-03-07').add(1, 'quarter')   // 2026-06-07
tdayjs('2026-03-07').subtract(1, 'week') // 2026-02-28
```

> **Why `add(1, 'month')` is different here:**
> Day.js (using `Date`) can return `March 3` for `January 31 + 1 month` depending on the engine.
> `@arkv/temporal` uses Temporal's calendar-aware arithmetic which correctly **clamps** to the last day of the target month.

### Start Of / End Of

```ts
const d = tdayjs('2026-03-15T10:30:45')

// Start of unit
d.startOf('year')   // 2026-01-01T00:00:00
d.startOf('month')  // 2026-03-01T00:00:00
d.startOf('week')   // 2026-03-09T00:00:00 (Sunday)
d.startOf('day')    // 2026-03-15T00:00:00
d.startOf('hour')   // 2026-03-15T10:00:00
d.startOf('minute') // 2026-03-15T10:30:00
d.startOf('second') // 2026-03-15T10:30:45.000

// End of unit
d.endOf('year')     // 2026-12-31T23:59:59.999
d.endOf('month')    // 2026-03-31T23:59:59.999
d.endOf('day')      // 2026-03-15T23:59:59.999
d.endOf('hour')     // 2026-03-15T10:59:59.999
```

### Format

Uses the same token syntax as Day.js:

```ts
const d = tdayjs('2026-03-07T09:05:03')

d.format()                    // '2026-03-07T09:05:03+HH:mm' (default)
d.format('YYYY-MM-DD')        // '2026-03-07'
d.format('DD/MM/YYYY')        // '07/03/2026'
d.format('MMM D, YYYY')       // 'Mar 7, 2026'
d.format('MMMM Do, YYYY')     // 'March 7, 2026' (no ordinal plugin needed)
d.format('HH:mm:ss')          // '09:05:03'
d.format('h:mm A')            // '9:05 AM'
d.format('h:mm a')            // '9:05 am'
d.format('[Today is] dddd')   // 'Today is Saturday'
d.format('ddd, MMM D')        // 'Sat, Mar 7'
```

| Token | Output | Description |
|-------|--------|-------------|
| `YYYY` | `2026` | 4-digit year |
| `YY` | `26` | 2-digit year |
| `M` | `3` | Month (1–12) |
| `MM` | `03` | Month, zero-padded |
| `MMM` | `Mar` | Abbreviated month name |
| `MMMM` | `March` | Full month name |
| `D` | `7` | Day of month (1–31) |
| `DD` | `07` | Day of month, zero-padded |
| `d` | `6` | Day of week (0=Sun, 6=Sat) |
| `dd` | `Sa` | Min weekday name |
| `ddd` | `Sat` | Short weekday name |
| `dddd` | `Saturday` | Full weekday name |
| `H` | `9` | Hour, 24h (0–23) |
| `HH` | `09` | Hour, 24h, zero-padded |
| `h` | `9` | Hour, 12h (1–12) |
| `hh` | `09` | Hour, 12h, zero-padded |
| `A` | `AM` | Meridiem, uppercase |
| `a` | `am` | Meridiem, lowercase |
| `m` | `5` | Minute (0–59) |
| `mm` | `05` | Minute, zero-padded |
| `s` | `3` | Second (0–59) |
| `ss` | `03` | Second, zero-padded |
| `SSS` | `000` | Milliseconds |
| `Z` | `+05:00` | UTC offset with colon |
| `ZZ` | `+0500` | UTC offset without colon |
| `[text]` | `text` | Escaped literal text |

### Difference

```ts
const a = tdayjs('2026-03-07')
const b = tdayjs('2025-01-01')

a.diff(b, 'year')        // 1
a.diff(b, 'month')       // 14
a.diff(b, 'day')         // 430
a.diff(b, 'hour')        // 10320
a.diff(b)                // milliseconds (default)

// Float for fractional result
a.diff(b, 'year', true)  // 1.17...

// Negative when self is before the argument
tdayjs('2025-01-01').diff(tdayjs('2026-03-07'), 'year') // -1
```

### Comparison

```ts
const past   = tdayjs('2025-01-01')
const now    = tdayjs('2026-03-07')
const future = tdayjs('2027-12-31')

now.isBefore(future)             // true
now.isAfter(past)                // true
now.isSame(tdayjs('2026-03-07')) // true (millisecond precision)

// With unit — compares within the granularity of the unit
const a = tdayjs('2026-03-07T10:00:00')
const b = tdayjs('2026-03-07T22:00:00')

a.isSame(b, 'day')   // true  — same day
a.isSame(b, 'hour')  // false — different hour
a.isBefore(b, 'day') // false — same day, not before
```

### Conversion

```ts
const d = tdayjs('2026-03-07T10:30:00')

d.valueOf()      // 1741343400000  — ms since Unix epoch
d.unix()         // 1741343400     — seconds since Unix epoch
d.daysInMonth()  // 31             — days in March
d.utcOffset()    // e.g. 60        — offset in minutes
d.toDate()       // native Date object
d.toISOString()  // '2026-03-07T10:30:00Z'
d.toJSON()       // '2026-03-07T10:30:00Z' (null if invalid)
d.toString()     // 'Sat, 07 Mar 2026 10:30:00 GMT'
```

### Locale

```ts
import tdayjs from '@arkv/temporal'
import type { ILocale } from '@arkv/temporal'

// Get current global locale
tdayjs.locale()            // 'en'

// Set global locale (register your own)
const fr: ILocale = {
  name: 'fr',
  months: ['Janvier', 'Février', /* ... */ 'Décembre'],
  monthsShort: ['Jan', 'Fév', /* ... */ 'Déc'],
  weekdays: ['Dimanche', 'Lundi', /* ... */ 'Samedi'],
  weekdaysShort: ['Dim', 'Lun', /* ... */ 'Sam'],
  weekdaysMin: ['Di', 'Lu', /* ... */ 'Sa'],
  weekStart: 1, // Monday
}
tdayjs.locale(fr)

// Per-instance locale (does not affect global)
tdayjs('2026-03-07').locale('en').format('MMMM')  // 'March'
tdayjs('2026-03-07').locale(fr).format('MMMM')    // 'Mars'
```

### Plugin System

The plugin interface is compatible with Day.js plugins so that existing plugin code can be adapted with minimal effort:

```ts
import tdayjs, { TDayjs } from '@arkv/temporal'

const myPlugin = (option, Cls, factory) => {
  Cls.prototype.yesterday = function () {
    return this.subtract(1, 'day')
  }
}

tdayjs.extend(myPlugin)
tdayjs().yesterday().format('YYYY-MM-DD')
```

> **Note:** Day.js plugins that directly access `this.$d` (the internal native `Date`) will not work because `@arkv/temporal` uses `Temporal.ZonedDateTime` internally (`this.$zdt`). Most formatting and arithmetic plugins can be rewritten to use the public API.

### Static Methods

```ts
tdayjs.isDayjs(tdayjs())    // true
tdayjs.isDayjs(new Date())  // false
tdayjs.unix(1741305600)     // same as tdayjs(1741305600 * 1000)
tdayjs.locale()             // get global locale name
tdayjs.locale('en')         // set global locale
```

---

## Key Differences from Day.js

| Feature | Day.js | @arkv/temporal |
|---------|--------|----------------|
| Internal engine | `Date` object | `Temporal.ZonedDateTime` |
| Month indexing | 0-indexed (Jan=0) | **Same** — 0-indexed for compatibility |
| Timezone support | Plugin required | Built-in (always zone-aware) |
| DST handling | Inaccurate (millisecond math) | Correct (calendar arithmetic) |
| Month overflow | Platform-dependent | Clamped to month end |
| Quarter support | Plugin required | **Native** — no plugin needed |
| Nanosecond precision | No | Yes (via Temporal) |
| Immutability | Via cloning | Fully immutable |
| `this.$d` (internal Date) | ✓ | ✗ — use `this.$zdt` instead |
| Plugin compatibility | Full | Partial (public API only) |

---

## Why Named Timezone Safety Matters

Consider this code:

```ts
// Setting a recurring alarm for 8:00 AM
const alarm = tdayjs('2026-11-01T08:00:00[America/New_York]')

// Adding 1 day (crosses the DST "fall back" on Nov 1, 2026)
alarm.add(1, 'day').format('HH:mm')
// Day.js with `Date`: '07:00' — wrong! (23 hours, not 24)
// @arkv/temporal:     '08:00' — correct! (wall-clock 8AM next day)
```

`Temporal` adds "1 calendar day" which means "tomorrow at the same wall-clock time", which is what users expect. `Date`-based libraries add "86,400,000 milliseconds" which is only correct when there's no DST transition.

---

## Compatibility Matrix

| Method | Status | Notes |
|--------|--------|-------|
| `dayjs()` / `tdayjs()` | ✅ Full | All input types supported |
| `.format()` | ✅ Full | All standard tokens |
| `.add()` / `.subtract()` | ✅ Full | Including quarters (no plugin needed) |
| `.startOf()` / `.endOf()` | ✅ Full | All time units |
| `.diff()` | ✅ Full | Including float mode |
| `.isBefore()` / `.isAfter()` / `.isSame()` | ✅ Full | With and without unit granularity |
| `.year()` / `.month()` / ... | ✅ Full | All getters and setters |
| `.get()` / `.set()` | ✅ Full | |
| `.locale()` | ✅ Full | Custom locale registration |
| `.utc()` / `.local()` | 🔜 Planned | UTC mode plugin |
| `.tz()` | 🔜 Planned | Named timezone switching |
| `.fromNow()` / `.to()` | 🔜 Planned | Relative time plugin |
| `.isLeapYear()` | 🔜 Planned | Via `$zdt.inLeapYear` |
| `.duration()` | 🔜 Planned | Via `Temporal.Duration` |

---

## TypeScript

All types are exported and match the Day.js type surface:

```ts
import tdayjs, {
  type TDayjs,
  type ConfigType,
  type UnitType,
  type OpUnitType,
  type QUnitType,
  type ManipulateType,
  type ILocale,
} from '@arkv/temporal'
```

---

## Runtime Requirements

- **Node.js**: 22+ (with Temporal polyfill included)
- **Bun**: Any version (with Temporal polyfill included)
- **Browsers**: Evergreen (with Temporal polyfill included)

The `temporal-polyfill` dependency is automatically included — you don't need to configure anything. Once native Temporal lands in all runtimes, the polyfill will become a no-op.

---

## License

MIT © [Petar Zarkov](https://github.com/petarzarkov)
