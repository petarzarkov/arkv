import { existsSync, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { decompressTarGz } from './decompress.js';
import { logger } from './logger.js';
import { paths } from './paths.js';
import type { IANATzDataFiles, IANATzDataParams } from './types.js';
import { removeLineBreaks } from './utils.js';

const DEFAULT_URL =
  'https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz';

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  retries = 5,
  baseDelay = 1000,
): Promise<Response> => {
  try {
    const res = await fetch(url, init);
    if (res.status === 304) {
      return res;
    }

    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status}`);
    }

    return res;
  } catch (error) {
    logger.error('Error on fetching IANA tz data', { error, retries });
    if (retries <= 0) {
      throw error;
    }

    const delay = baseDelay * Math.pow(1.5, 5 - retries);
    await new Promise((resolve) =>
      setTimeout(resolve, delay + Math.random() * 100),
    );
    return await fetchWithRetry(url, init, retries - 1, baseDelay);
  }
};

/**
 * Returns `null` when IANA reports the archive is unchanged since the last run.
 */
export const fetchData = async (
  params?: IANATzDataParams,
): Promise<IANATzDataFiles | null> => {
  const url = params?.url ?? process.env.IANA_TZ_DB_URL ?? DEFAULT_URL;
  const filesToExtract = params?.filesToExtract ?? [
    'zone.tab',
    'backward',
    'etcetera',
  ];
  const fileEncoding = params?.fileEncoding ?? 'utf8';

  const init: RequestInit = { method: 'GET', redirect: 'follow' };

  if (process.env.FORCE_REVALIDATE === 'true') {
    logger.debug(
      'FORCE_REVALIDATE enabled, fetching clean slate data from iana db',
    );
  } else if (existsSync(paths.previousJson)) {
    const { lastModified } = JSON.parse(
      readFileSync(paths.previousJson, 'utf8'),
    ) as { lastModified: string };
    init.headers = {
      'If-Modified-Since': new Date(lastModified).toUTCString(),
    };
  }

  const response = await fetchWithRetry(url, init);
  if (response.status === 304) {
    logger.info(
      'No IANA db timezone changes since last check, skipping data processing',
      { init },
    );
    return null;
  }

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const lastModified = response.headers.get('last-modified');
  const decompressed = await decompressTarGz(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
  );

  const files: IANATzDataFiles = decompressed.reduce<IANATzDataFiles>(
    (acc, file) => {
      if (filesToExtract.includes(file.path) || file.path === 'version') {
        acc[file.path] = file.data.toString(fileEncoding);
      }
      return acc;
    },
    {
      version: 'no version file found',
      lastModified: lastModified || 'no last modified date',
    },
  );

  files.version = removeLineBreaks(files.version);

  return files;
};
