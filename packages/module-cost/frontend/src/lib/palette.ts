export type Mode = 'light' | 'dark';

// Validated categorical palette (dataviz skill). Fixed order, never cycled:
// the top scopes by size take these slots, everything else folds into "Other".
const CATEGORICAL: Record<Mode, string[]> = {
  light: [
    '#2a78d6',
    '#eb6834',
    '#1baf7a',
    '#eda100',
    '#e87ba4',
    '#008300',
    '#4a3aa7',
    '#e34948',
  ],
  dark: [
    '#3987e5',
    '#d95926',
    '#199e70',
    '#c98500',
    '#d55181',
    '#008300',
    '#9085e9',
    '#e66767',
  ],
};

const OTHER: Record<Mode, string> = { light: '#a8a69c', dark: '#6b6a62' };

export interface LegendEntry {
  scope: string;
  color: string;
}

export interface ScopeColors {
  colorFor: (scope: string) => string;
  legend: LegendEntry[];
  otherColor: string;
  hasOther: boolean;
}

export function buildScopeColors(
  orderedScopes: string[],
  mode: Mode,
): ScopeColors {
  const palette = CATEGORICAL[mode];
  const otherColor = OTHER[mode];
  const top = orderedScopes.slice(0, palette.length);
  const map = new Map<string, string>();
  top.forEach((scope, i) => map.set(scope, palette[i]));
  return {
    colorFor: (scope) => map.get(scope) ?? otherColor,
    legend: top.map((scope, i) => ({ scope, color: palette[i] })),
    otherColor,
    hasOther: orderedScopes.length > palette.length,
  };
}

// Pick readable ink for a label drawn on top of a colored tile (WCAG luminance).
export function textOn(hex: string): string {
  const channel = (start: number): number => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.45 ? '#0b0b0b' : '#ffffff';
}
