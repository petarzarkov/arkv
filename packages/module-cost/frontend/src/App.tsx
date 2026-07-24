import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  AppShell,
  Center,
  Chip,
  Grid,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { fetchModel } from './api';
import type { CostModel, Metric } from './types';
import { buildScopeColors } from './lib/palette';
import { formatBytes, METRIC_HELP, METRIC_LABELS } from './lib/format';
import { Treemap } from './components/Treemap';
import { ScopeBars } from './components/ScopeBars';
import { PackageTable } from './components/PackageTable';
import { DetailPanel } from './components/DetailPanel';

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('dark');
  const next = computed === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip label={`Switch to ${next} theme`}>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label="Toggle color scheme"
        onClick={() => setColorScheme(next)}
      >
        {computed === 'dark' ? '☾' : '☀'}
      </ActionIcon>
    </Tooltip>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Stack gap={0} align="flex-end">
      <Text fw={700} lh={1.1}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Stack>
  );
}

export function App() {
  const [model, setModel] = useState<CostModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('self');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const mode = useComputedColorScheme('dark');

  useEffect(() => {
    fetchModel()
      .then(setModel)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  const colors = useMemo(
    () => buildScopeColors(model ? model.scopes.map((s) => s.scope) : [], mode),
    [model, mode],
  );

  if (error) {
    return (
      <Center h="100vh" p="xl">
        <Alert color="red" title="Could not load analysis" maw={480}>
          {error}
        </Alert>
      </Center>
    );
  }

  if (!model) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  const selected =
    selectedId !== null ? (model.packages[selectedId] ?? null) : null;
  const prodCount = model.packages.filter((p) => p.prod).length;
  const devCount = model.packageCount - prodCount;
  // No chip selected = show everything; otherwise show only the selected kind(s).
  const visible =
    kinds.length === 0
      ? model.packages
      : model.packages.filter((p) => kinds.includes(p.prod ? 'prod' : 'dev'));

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Title order={4} style={{ whiteSpace: 'nowrap' }}>
              module-cost
            </Title>
            <Text size="sm" c="dimmed" truncate>
              {model.target.name}@{model.target.version}
            </Text>
          </Group>
          <Group gap="lg" wrap="nowrap">
            <Group gap="lg" visibleFrom="sm" wrap="nowrap">
              <Stat value={formatBytes(model.totalSelfSize)} label="on disk" />
              <Stat
                value={model.packageCount.toLocaleString()}
                label="packages"
              />
              <Stat
                value={model.scopes.length.toLocaleString()}
                label="scopes"
              />
            </Group>
            <Tooltip label={METRIC_HELP[metric]} multiline w={260} withArrow>
              <SegmentedControl
                size="xs"
                value={metric}
                onChange={(v) => setMetric(v as Metric)}
                data={(['self', 'exclusive', 'transitive'] as Metric[]).map(
                  (m) => ({
                    value: m,
                    label: METRIC_LABELS[m],
                  }),
                )}
              />
            </Tooltip>
            <ThemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Chip.Group multiple value={kinds} onChange={setKinds}>
                  <Group gap="xs">
                    <Chip value="prod" size="xs" color="teal" variant="outline">
                      Production · {prodCount}
                    </Chip>
                    <Chip value="dev" size="xs" color="gray" variant="outline">
                      Dev · {devCount}
                    </Chip>
                  </Group>
                </Chip.Group>
                <Text size="xs" c="dimmed">
                  {kinds.length > 0 && kinds.length < 2
                    ? `${visible.length} of ${model.packageCount} shown`
                    : `${model.packageCount} packages`}
                </Text>
              </Group>
              <Paper
                withBorder
                radius="md"
                p={4}
                style={{ height: 'min(60vh, 640px)', minHeight: 340 }}
              >
                <Treemap
                  packages={visible}
                  metric={metric}
                  colorFor={colors.colorFor}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </Paper>
              <Text size="xs" c="dimmed" ta="center">
                Tile area = {METRIC_LABELS[metric].toLowerCase()} size.{' '}
                {METRIC_HELP[metric]}
              </Text>
              <PackageTable
                packages={visible}
                metric={metric}
                colorFor={colors.colorFor}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="md">
              <DetailPanel
                pkg={selected}
                packages={model.packages}
                onSelect={setSelectedId}
              />
              <ScopeBars
                scopes={model.scopes}
                total={model.totalSelfSize}
                colorFor={colors.colorFor}
                hasOther={colors.hasOther}
              />
            </Stack>
          </Grid.Col>
        </Grid>
      </AppShell.Main>
    </AppShell>
  );
}
