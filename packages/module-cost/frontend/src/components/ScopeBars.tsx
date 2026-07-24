import { Box, Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { ScopeRollup } from '../types';
import { formatBytes } from '../lib/format';

interface ScopeBarsProps {
  scopes: ScopeRollup[];
  total: number;
  colorFor: (scope: string) => string;
  hasOther: boolean;
}

export function ScopeBars({
  scopes,
  total,
  colorFor,
  hasOther,
}: ScopeBarsProps) {
  const shown = scopes.slice(0, 12);
  const max = shown.reduce((acc, s) => Math.max(acc, s.selfSize), 1);

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="xs">
        <Title order={5}>Scopes by size</Title>
        <Text size="xs" c="dimmed">
          self · {formatBytes(total)} total
        </Text>
      </Group>
      <Stack gap="xs">
        {shown.map((scope) => {
          const pct = (scope.selfSize / total) * 100;
          return (
            <Box key={scope.scope}>
              <Group justify="space-between" gap="xs" mb={2} wrap="nowrap">
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  <Box
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: colorFor(scope.scope),
                      flexShrink: 0,
                    }}
                  />
                  <Text size="sm" truncate>
                    {scope.scope}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    ×{scope.count}
                  </Text>
                </Group>
                <Text size="sm" fw={600} style={{ flexShrink: 0 }}>
                  {formatBytes(scope.selfSize)}
                </Text>
              </Group>
              <Box
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: colorFor(scope.scope),
                  width: `${Math.max(2, (scope.selfSize / max) * 100)}%`,
                  opacity: 0.85,
                }}
                title={`${pct.toFixed(1)}% of total`}
              />
            </Box>
          );
        })}
      </Stack>
      {hasOther ? (
        <Text size="xs" c="dimmed" mt="sm">
          The treemap colors the top scopes; the rest share one neutral tone.
        </Text>
      ) : null}
    </Paper>
  );
}
