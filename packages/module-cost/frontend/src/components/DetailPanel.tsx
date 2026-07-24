import {
  Anchor,
  Badge,
  Code,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import type { PackageNode } from '../types';
import { formatBytes } from '../lib/format';

interface DetailPanelProps {
  pkg: PackageNode | null;
  packages: PackageNode[];
  onSelect: (id: number | null) => void;
}

function SizeStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Paper withBorder radius="sm" p="xs">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={700}>
        {formatBytes(value)}
      </Text>
      <Text size="xs" c="dimmed" lineClamp={2}>
        {hint}
      </Text>
    </Paper>
  );
}

function Related({
  title,
  ids,
  packages,
  onSelect,
}: {
  title: string;
  ids: number[];
  packages: PackageNode[];
  onSelect: (id: number | null) => void;
}) {
  if (ids.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        {title}: none
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        {title} ({ids.length})
      </Text>
      <Group gap={4}>
        {ids
          .map((id) => packages[id])
          .filter(Boolean)
          .sort((a, b) => b.selfSize - a.selfSize)
          .slice(0, 40)
          .map((dep) => (
            <Badge
              key={dep.id}
              size="sm"
              variant="light"
              color="gray"
              style={{ cursor: 'pointer', textTransform: 'none' }}
              onClick={() => onSelect(dep.id)}
            >
              {dep.name}
            </Badge>
          ))}
      </Group>
    </Stack>
  );
}

export function DetailPanel({ pkg, packages, onSelect }: DetailPanelProps) {
  if (!pkg) {
    return (
      <Paper withBorder radius="md" p="md">
        <Title order={5} mb={4}>
          Package detail
        </Title>
        <Text size="sm" c="dimmed">
          Click any tile or table row to inspect a package — its three size
          measures, direct dependencies, and everything that depends on it.
        </Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" wrap="nowrap" mb={2}>
        <Title order={5} style={{ wordBreak: 'break-all' }}>
          {pkg.name}
        </Title>
        <Anchor
          size="xs"
          href={`https://www.npmjs.com/package/${pkg.name}`}
          target="_blank"
          rel="noreferrer"
        >
          npm ↗
        </Anchor>
      </Group>
      <Group gap="xs" mb="sm">
        <Badge variant="light" color="grape" style={{ textTransform: 'none' }}>
          v{pkg.version}
        </Badge>
        <Badge variant="light" color="gray" style={{ textTransform: 'none' }}>
          {pkg.scope}
        </Badge>
        <Badge variant="light" color={pkg.prod ? 'teal' : 'gray'}>
          {pkg.prod ? 'production' : 'dev-only'}
        </Badge>
        {pkg.direct ? <Badge variant="light">direct dependency</Badge> : null}
        <Text size="xs" c="dimmed">
          depth {pkg.depth < 0 ? '—' : pkg.depth}
        </Text>
      </Group>

      <SimpleGrid cols={3} spacing="xs" mb="sm">
        <SizeStat label="Self" value={pkg.selfSize} hint="own files" />
        <SizeStat
          label="Exclusive"
          value={pkg.exclusiveSize}
          hint="reclaimed if removed"
        />
        <SizeStat
          label="Transitive"
          value={pkg.transitiveSize}
          hint="self + all deps"
        />
      </SimpleGrid>

      <Code
        block
        mb="sm"
        style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
      >
        {pkg.path}
      </Code>

      <ScrollArea.Autosize mah={260}>
        <Stack gap="sm">
          <Related
            title="Depends on"
            ids={pkg.deps}
            packages={packages}
            onSelect={onSelect}
          />
          <Related
            title="Depended on by"
            ids={pkg.dependents}
            packages={packages}
            onSelect={onSelect}
          />
        </Stack>
      </ScrollArea.Autosize>
    </Paper>
  );
}
