import { logger } from './logger.js';

const futureOffsets: Record<string, string> = {
  'America/Coyhaique': '-03:00',
};

export const getCurrentOffset = (tzCode: string): string | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzCode,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());

    const offset = parts.find((part) => part.type === 'timeZoneName')?.value;
    if (offset?.startsWith('GMT')) {
      const withoutPrefix = offset.slice(3);
      return withoutPrefix !== '' ? withoutPrefix : '+00:00';
    }

    return offset || null;
  } catch (error) {
    if (futureOffsets[tzCode]) {
      return futureOffsets[tzCode];
    }

    logger.warn(`Could not get offset for timezone "${tzCode}":`, error);
    return null;
  }
};
