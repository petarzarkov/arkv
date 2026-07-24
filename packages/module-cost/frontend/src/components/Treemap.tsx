import { useMemo, useState } from 'react';
import { hierarchy, treemap } from 'd3-hierarchy';
import type { HierarchyRectangularNode } from 'd3-hierarchy';
import { useElementSize } from '@mantine/hooks';
import { Box, Paper, Stack, Text } from '@mantine/core';
import type { Metric, PackageNode } from '../types';
import { formatBytes, METRIC_LABELS, sizeFor } from '../lib/format';
import { textOn } from '../lib/palette';

interface TreeDatum {
  name: string;
  scope: string;
  pkg?: PackageNode;
  children?: TreeDatum[];
}

interface HoverState {
  x: number;
  y: number;
  pkg: PackageNode;
}

interface TreemapProps {
  packages: PackageNode[];
  metric: Metric;
  colorFor: (scope: string) => string;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

function clip(name: string, width: number): string {
  const max = Math.floor((width - 10) / 6.4);
  const short = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
  if (max < 2) return '';
  return short.length > max
    ? `${short.slice(0, Math.max(1, max - 1))}…`
    : short;
}

export function Treemap({
  packages,
  metric,
  colorFor,
  selectedId,
  onSelect,
}: TreemapProps) {
  const { ref, width, height } = useElementSize();
  const [hover, setHover] = useState<HoverState | null>(null);

  const leaves = useMemo<HierarchyRectangularNode<TreeDatum>[]>(() => {
    if (width < 10 || height < 10) return [];
    const byScope = new Map<string, TreeDatum[]>();
    for (const pkg of packages) {
      if (sizeFor(pkg, metric) <= 0) continue;
      const leaf: TreeDatum = { name: pkg.name, scope: pkg.scope, pkg };
      const list = byScope.get(pkg.scope);
      if (list) list.push(leaf);
      else byScope.set(pkg.scope, [leaf]);
    }
    const root = hierarchy<TreeDatum>({
      name: 'root',
      scope: '',
      children: [...byScope].map(([scope, children]) => ({
        name: scope,
        scope,
        children,
      })),
    })
      .sum((d) => (d.pkg ? sizeFor(d.pkg, metric) : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const layout = treemap<TreeDatum>()
      .size([width, height])
      .paddingInner(2)
      .round(true);
    return layout(root).leaves();
  }, [packages, metric, width, height]);

  return (
    <Box
      ref={ref}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <svg
        width={width}
        height={height}
        style={{ display: 'block' }}
        aria-label="node_modules treemap"
      >
        {leaves.map((node) => {
          const pkg = node.data.pkg;
          if (!pkg) return null;
          const w = node.x1 - node.x0;
          const h = node.y1 - node.y0;
          const color = colorFor(node.data.scope);
          const isSelected = pkg.id === selectedId;
          const dimmed = selectedId !== null && !isSelected;
          const label = w > 46 && h > 22 ? clip(node.data.name, w) : '';
          return (
            <g
              key={pkg.id}
              transform={`translate(${node.x0},${node.y0})`}
              style={{ cursor: 'pointer' }}
              onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, pkg })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(isSelected ? null : pkg.id)}
            >
              <rect
                width={w}
                height={h}
                rx={3}
                fill={color}
                opacity={dimmed ? 0.45 : 1}
                stroke={
                  isSelected ? 'var(--mantine-color-text)' : 'transparent'
                }
                strokeWidth={isSelected ? 2 : 0}
              />
              {label ? (
                <text
                  x={5}
                  y={15}
                  fontSize={11}
                  fontWeight={600}
                  fill={textOn(color)}
                  style={{ pointerEvents: 'none' }}
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover ? (
        <Paper
          shadow="md"
          radius="sm"
          p="xs"
          withBorder
          style={{
            position: 'fixed',
            left: Math.min(
              hover.x + 14,
              (typeof window === 'undefined' ? 0 : window.innerWidth) - 240,
            ),
            top: hover.y + 14,
            width: 224,
            pointerEvents: 'none',
            zIndex: 400,
          }}
        >
          <Stack gap={2}>
            <Text size="sm" fw={600} style={{ wordBreak: 'break-all' }}>
              {hover.pkg.name}
            </Text>
            <Text size="xs" c="dimmed">
              v{hover.pkg.version} · {hover.pkg.scope} ·{' '}
              {hover.pkg.prod ? 'prod' : 'dev'}
            </Text>
            <Text size="xs">
              {METRIC_LABELS[metric]}:{' '}
              <b>{formatBytes(sizeFor(hover.pkg, metric))}</b>
            </Text>
            <Text size="xs" c="dimmed">
              self {formatBytes(hover.pkg.selfSize)} · excl{' '}
              {formatBytes(hover.pkg.exclusiveSize)} ·{' '}
              {hover.pkg.dependents.length} dependents
            </Text>
          </Stack>
        </Paper>
      ) : null}
    </Box>
  );
}
