export interface ILocale {
  name: string;
  months: string[];
  monthsShort: string[];
  weekdays: string[];
  weekdaysShort: string[];
  weekdaysMin: string[];
  weekStart: number;
}

const en: ILocale = {
  name: 'en',
  months: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  monthsShort: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  weekdays: [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ],
  weekdaysShort: [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
  ],
  weekdaysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  weekStart: 0,
};

const Ls: Record<string, ILocale> = { en };
let globalLocale = 'en';

export function getLocaleObj(name: string): ILocale {
  return Ls[name] ?? en;
}

export function getGlobalLocale(): string {
  return globalLocale;
}

export function setGlobalLocale(name: string): void {
  globalLocale = name;
}

export function registerLocale(locale: ILocale): void {
  Ls[locale.name] = locale;
}

export { Ls };
