import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Group,
  Paper,
  ScrollArea,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import type { Metric, PackageNode } from '../types';
import { formatBytes } from '../lib/format';

type SortKey =
  | 'name'
  | 'selfSize'
  | 'exclusiveSize'
  | 'transitiveSize'
  | 'dependents';

const MAX_ROWS = 250;

interface PackageTableProps {
  packages: PackageNode[];
  metric: Metric;
  colorFor: (scope: string) => string;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

const METRIC_SORT: Record<Metric, SortKey> = {
  self: 'selfSize',
  transitive: 'transitiveSize',
  exclusive: 'exclusiveSize',
};

function sortValue(pkg: PackageNode, key: SortKey): number | string {
  if (key === 'name') return pkg.name;
  if (key === 'dependents') return pkg.dependents.length;
  return pkg[key];
}

function HeaderCell({
  label,
  column,
  sort,
  dir,
  onSort,
  numeric,
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: 1 | -1;
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const active = sort === column;
  return (
    <Table.Th style={{ textAlign: numeric ? 'right' : 'left' }}>
      <UnstyledButton onClick={() => onSort(column)} style={{ width: '100%' }}>
        <Text
          size="xs"
          fw={600}
          c={active ? undefined : 'dimmed'}
          ta={numeric ? 'right' : 'left'}
        >
          {label} {active ? (dir === 1 ? '↑' : '↓') : ''}
        </Text>
      </UnstyledButton>
    </Table.Th>
  );
}

export function PackageTable({
  packages,
  metric,
  colorFor,
  selectedId,
  onSelect,
}: PackageTableProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('selfSize');
  const [dir, setDir] = useState<1 | -1>(-1);

  const activeSort = query || sort !== 'selfSize' ? sort : METRIC_SORT[metric];

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? packages.filter((p) => p.name.toLowerCase().includes(needle))
      : packages;
    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, activeSort);
      const bv = sortValue(b, activeSort);
      if (typeof av === 'string' && typeof bv === 'string')
        return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return sorted;
  }, [packages, query, activeSort, dir]);

  const onSort = (key: SortKey) => {
    if (key === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(key);
      setDir(key === 'name' ? 1 : -1);
    }
  };

  const visible = rows.slice(0, MAX_ROWS);

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm">
        <Title order={5}>Packages</Title>
        <TextInput
          size="xs"
          placeholder="Filter by name…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={220}
        />
      </Group>
      <ScrollArea.Autosize mah={420} type="auto">
        <Table
          stickyHeader
          highlightOnHover
          striped
          verticalSpacing={4}
          fz="sm"
        >
          <Table.Thead>
            <Table.Tr>
              <HeaderCell
                label="Package"
                column="name"
                sort={activeSort}
                dir={dir}
                onSort={onSort}
              />
              <HeaderCell
                label="Self"
                column="selfSize"
                sort={activeSort}
                dir={dir}
                onSort={onSort}
                numeric
              />
              <HeaderCell
                label="Excl"
                column="exclusiveSize"
                sort={activeSort}
                dir={dir}
                onSort={onSort}
                numeric
              />
              <HeaderCell
                label="Trans"
                column="transitiveSize"
                sort={activeSort}
                dir={dir}
                onSort={onSort}
                numeric
              />
              <HeaderCell
                label="Deps"
                column="dependents"
                sort={activeSort}
                dir={dir}
                onSort={onSort}
                numeric
              />
              <Table.Th>
                <Text size="xs" fw={600} c="dimmed" ta="center">
                  Kind
                </Text>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visible.map((pkg) => (
              <Table.Tr
                key={pkg.id}
                bg={
                  pkg.id === selectedId
                    ? 'var(--mantine-primary-color-light)'
                    : undefined
                }
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(pkg.id === selectedId ? null : pkg.id)}
              >
                <Table.Td>
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <Box
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 2,
                        background: colorFor(pkg.scope),
                        flexShrink: 0,
                      }}
                    />
                    <Text size="sm" truncate style={{ maxWidth: 260 }}>
                      {pkg.name}
                    </Text>
                    {pkg.direct ? (
                      <Badge size="xs" variant="light" color="grape">
                        direct
                      </Badge>
                    ) : null}
                  </Group>
                </Table.Td>
                <Table.Td ta="right">{formatBytes(pkg.selfSize)}</Table.Td>
                <Table.Td ta="right">{formatBytes(pkg.exclusiveSize)}</Table.Td>
                <Table.Td ta="right">
                  {formatBytes(pkg.transitiveSize)}
                </Table.Td>
                <Table.Td ta="right">{pkg.dependents.length}</Table.Td>
                <Table.Td ta="center">
                  <Text size="xs" c={pkg.prod ? 'teal' : 'dimmed'}>
                    {pkg.prod ? 'prod' : 'dev'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
      <Text size="xs" c="dimmed" mt="xs">
        {rows.length > MAX_ROWS
          ? `Showing top ${MAX_ROWS} of ${rows.length} packages`
          : `${rows.length} packages`}
      </Text>
    </Paper>
  );
}
