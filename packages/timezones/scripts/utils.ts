export const formatLocation = (location: string): string =>
  location.replace('/', ' - ').replace('_', ' ');

export const extractGeographicAreaAndLocation = (
  input: string,
): { geographicArea: string | null; location: string } => {
  const firstSlash = input.indexOf('/');
  if (firstSlash === -1) {
    return { geographicArea: null, location: input };
  }

  return {
    geographicArea: input.slice(0, firstSlash),
    location: input.slice(firstSlash + 1),
  };
};

export const removeLineBreaks = (value: string): string =>
  value.replace(/\n/g, '');

export const deepSort = <
  ToSort extends Record<string, unknown> | Record<string, unknown>[],
>(
  obj: ToSort,
): ToSort => {
  if (Array.isArray(obj)) {
    return obj
      .map(deepSort)
      .sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ) as ToSort;
  }

  if (typeof obj === 'object' && obj !== null) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = deepSort(obj[key] as Record<string, unknown>);
    }
    return sorted as ToSort;
  }

  return obj;
};
