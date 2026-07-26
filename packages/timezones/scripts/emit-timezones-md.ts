import { writeFileSync } from 'node:fs';
import { paths } from './paths.js';
import type { ParsedData, ParsedZone } from './parse-data.js';

const toAnchor = (tzCode: string): string =>
  tzCode
    .toLowerCase()
    .replace(/[/_]/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const toLink = (tzCode: string): string =>
  `[\`${tzCode}\`](#${toAnchor(tzCode)})`;

export const emitTimezonesMarkdown = (parsedData: ParsedData): void => {
  const zonesByArea = new Map<string, ParsedZone[]>();
  for (const zone of Object.values(parsedData.zones)) {
    const area = zone.geographicArea ?? 'Etc';
    const areaZones = zonesByArea.get(area);
    if (areaZones) {
      areaZones.push(zone);
    } else {
      zonesByArea.set(area, [zone]);
    }
  }

  const content = Array.from(zonesByArea.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, zones]) => {
      const header = `## ${area}\n\n| Location | Timezone | Type | Country Codes | Current Offset | Link |\n|----------|----------|------|---------------|----------------|------|\n`;

      const rows = zones
        .sort((a, b) => a.tzCode.localeCompare(b.tzCode))
        .map((zone) => {
          const countryCodes = zone.countryCodes?.length
            ? zone.countryCodes.join(', ')
            : '-';

          let linkText = '-';
          if ('children' in zone && zone.children?.length) {
            linkText = `Children: ${zone.children.map(toLink).join(', ')}`;
          } else if ('parent' in zone && zone.parent) {
            linkText = `Parent: ${toLink(zone.parent)}`;
          }

          return `| <a name="${toAnchor(zone.tzCode)}"></a>${zone.locationLabel ?? '-'} | \`${zone.tzCode}\` | ${zone.type} | ${countryCodes} | ${zone.utc || 'N/A'} | ${linkText} |`;
        })
        .join('\n');

      return `${header}${rows}\n`;
    })
    .join('\n');

  writeFileSync(paths.timezonesMarkdown, `## Full Timezone Data\n\n${content}`);
};
