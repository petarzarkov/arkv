import 'temporal-polyfill/global';

import { DEFAULT_TZ, TDayjs } from './dayjs.js';
import {
  getGlobalLocale,
  type ILocale,
  registerLocale,
  setGlobalLocale,
} from './locale.js';
import type { ConfigType } from './types.js';

export { TDayjs } from './dayjs.js';
export type { ILocale } from './locale.js';
export type {
  ConfigType,
  ManipulateType,
  OpUnitType,
  QUnitType,
  UnitType,
  UnitTypeLong,
  UnitTypeLongPlural,
  UnitTypeShort,
} from './types.js';

type PluginFunc<T = unknown> = (
  option: T,
  c: typeof TDayjs,
  d: typeof tdayjs,
) => void;

const installed = new Set<PluginFunc>();

function tdayjs(date?: ConfigType): TDayjs {
  if (date instanceof TDayjs) return date.clone();
  return new TDayjs({ date });
}

tdayjs.extend = <T>(
  plugin: PluginFunc<T>,
  option?: T,
): typeof tdayjs => {
  if (!installed.has(plugin as PluginFunc)) {
    plugin(option as T, TDayjs, tdayjs);
    installed.add(plugin as PluginFunc);
  }
  return tdayjs;
};

tdayjs.isDayjs = (d: unknown): d is TDayjs => {
  return d instanceof TDayjs;
};

tdayjs.unix = (t: number): TDayjs => {
  return new TDayjs({
    date: t * 1_000,
    tz: DEFAULT_TZ,
  });
};

tdayjs.locale = (
  preset?: string | ILocale,
  object?: Partial<ILocale>,
): string => {
  if (preset === undefined) return getGlobalLocale();
  let name: string;
  if (typeof preset === 'string') {
    name = preset.toLowerCase();
    if (object) {
      registerLocale({ ...object, name } as ILocale);
    }
    setGlobalLocale(name);
  } else {
    registerLocale(preset);
    name = preset.name;
    setGlobalLocale(name);
  }
  return name;
};

export default tdayjs;
