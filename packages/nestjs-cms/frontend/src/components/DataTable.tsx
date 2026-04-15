import { useMemo, useState } from 'react';
import {
  Table,
  Button,
  Group,
  Text,
  Loader,
  Center,
  Pagination,
  ActionIcon,
  Badge,
  Tooltip,
  Alert,
  Modal,
  ScrollArea,
  Paper,
  Stack,
  Menu,
  Checkbox,
} from '@mantine/core';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from '../api-client.js';
import { toStr } from '../utils.js';
import type { CmsField, CmsModel, CmsPagination } from '../types.js';

interface Props {
  model: CmsModel;
  scheme?: string;
  onEdit: (row: Record<string, unknown>) => void;
  onCreate: () => void;
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  );
}

export function DataTable({ model, scheme, onEdit, onCreate }: Props) {
  const client = createApiClient(scheme);
  const qc = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const listEndpoint = model.endpoints.list;
  const pagination = listEndpoint?.pagination;

  function buildUrl(): string {
    if (!listEndpoint) return '';
    if (!pagination || pagination.style === 'none') return listEndpoint.path;

    const params = new URLSearchParams();
    const size = String(pagination.pageSize);

    if (pagination.style === 'cursor') {
      if (cursor) params.set(pagination.cursorParam ?? 'cursor', cursor);
      if (pagination.limitParam) params.set(pagination.limitParam, size);
    } else if (pagination.style === 'page') {
      params.set(pagination.pageParam ?? 'page', String(page));
      if (pagination.limitParam) params.set(pagination.limitParam, size);
    } else {
      params.set(
        pagination.offsetParam ?? 'offset',
        String((page - 1) * pagination.pageSize),
      );
      if (pagination.limitParam) params.set(pagination.limitParam, size);
    }

    return `${listEndpoint.path}?${params.toString()}`;
  }

  const { data, isLoading, isError, error } = useQuery<unknown>({
    queryKey: ['list', model.name, page, cursor],
    queryFn: () => {
      if (!listEndpoint) throw new Error('No list endpoint');
      return client.get(buildUrl());
    },
    enabled: Boolean(listEndpoint),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!model.endpoints.delete) throw new Error('No delete endpoint');
      const path = model.endpoints.delete.path
        .replace('{id}', id)
        .replace(':id', id);
      return client.delete(path);
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['list', model.name] }),
    onError: (err) =>
      setDeleteError(err instanceof Error ? err.message : 'Delete failed'),
  });

  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : Array.isArray((data as Record<string, unknown>)?.['data'])
      ? ((data as Record<string, unknown[]>)['data'] as Record<
          string,
          unknown
        >[])
      : [];

  const total: number =
    typeof (data as Record<string, unknown>)?.['total'] === 'number'
      ? (data as Record<string, number>)['total']
      : rows.length;

  const nextCursor = extractNextCursor(data);
  const totalPages = Math.max(
    1,
    Math.ceil(total / (pagination?.pageSize ?? 20)),
  );

  function goToNext() {
    if (!nextCursor) return;
    setCursorHistory((h) => [...h, cursor ?? '']);
    setCursor(nextCursor);
  }

  function goToPrev() {
    const history = [...cursorHistory];
    const prev = history.pop() ?? null;
    setCursorHistory(history);
    setCursor(prev);
  }

  const allFields = Object.entries(model.schema).filter(
    ([, f]) => !f.readOnly || f.type !== 'object',
  );

  const defaultHidden = useMemo(() => {
    if (model.maxTableColumns == null) return new Set<string>();
    return new Set(
      allFields.slice(model.maxTableColumns).map(([name]) => name),
    );
  }, [model.maxTableColumns, allFields.length]);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    defaultHidden,
  );

  const visibleFields = allFields.filter(
    ([name]) => !hiddenColumns.has(name),
  );

  function toggleColumn(name: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  const lookupColumns = visibleFields
    .filter(([, f]) => f.lookup)
    .map(([name, field]) => ({
      name,
      field,
      header:
        name
          .replace(/[Ii]d$/, '')
          .replace(/([A-Z])/g, ' $1')
          .trim() || name,
    }));

  function toggleSort(name: string) {
    if (sortBy === name) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(name);
      setSortDir('asc');
    }
  }

  const sortedRows =
    sortBy === null
      ? rows
      : [...rows].sort((a, b) => {
          const fieldType = model.schema[sortBy]?.type ?? 'string';
          const av = a[sortBy];
          const bv = b[sortBy];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          let cmp = 0;
          if (fieldType === 'number') {
            cmp = (av as number) - (bv as number);
          } else if (fieldType === 'date') {
            cmp =
              new Date(av as string).getTime() -
              new Date(bv as string).getTime();
          } else {
            cmp = toStr(av).localeCompare(toStr(bv));
          }
          return sortDir === 'asc' ? cmp : -cmp;
        });

  if (isLoading) {
    return (
      <Center h={300}>
        <Loader size="md" />
      </Center>
    );
  }

  if (isError) {
    return (
      <Alert color="red" mt="md" radius="md">
        {error instanceof Error ? error.message : 'Failed to load data'}
      </Alert>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Group justify="space-between" mb="md" align="center">
        <Text fw={700} size="xl" style={{ letterSpacing: '-0.01em' }}>
          {model.name}
        </Text>
        <Group gap="xs">
          <Menu
            shadow="md"
            width={220}
            closeOnItemClick={false}
            position="bottom-end"
          >
            <Menu.Target>
              <Tooltip label="Toggle columns" withArrow>
                <ActionIcon variant="default" size="md" radius="md">
                  <ColumnsIcon />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Visible columns</Menu.Label>
              {allFields.map(([name]) => (
                <Menu.Item
                  key={name}
                  leftSection={
                    <Checkbox
                      size="xs"
                      checked={!hiddenColumns.has(name)}
                      onChange={() => toggleColumn(name)}
                      tabIndex={-1}
                      styles={{ input: { cursor: 'pointer' } }}
                    />
                  }
                  onClick={() => toggleColumn(name)}
                >
                  <Text size="sm">
                    {name.replace(/([A-Z])/g, ' $1').trim()}
                  </Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          {model.endpoints.create && (
            <Button size="sm" radius="md" onClick={onCreate}>
              + Create
            </Button>
          )}
        </Group>
      </Group>

      {deleteError && (
        <Alert
          color="red"
          mb="md"
          radius="md"
          withCloseButton
          onClose={() => setDeleteError(null)}
        >
          {deleteError}
        </Alert>
      )}

      <Paper shadow="xs" radius="md" withBorder style={{ overflow: 'hidden' }}>
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead
              style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}
            >
              <Table.Tr>
                {visibleFields.map(([name]) => (
                  <Table.Th
                    key={name}
                    onClick={() => toggleSort(name)}
                    style={{
                      cursor: 'pointer',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--mantine-color-dimmed)',
                      paddingTop: 10,
                      paddingBottom: 10,
                    }}
                  >
                    {name.replace(/([A-Z])/g, ' $1').trim()}
                    <span style={{ marginLeft: 4, opacity: 0.5 }}>
                      {sortBy === name ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </Table.Th>
                ))}
                {lookupColumns.map(({ name, header }) => (
                  <Table.Th
                    key={`lookup-${name}`}
                    style={{
                      whiteSpace: 'nowrap',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--mantine-color-blue-4)',
                      paddingTop: 10,
                      paddingBottom: 10,
                    }}
                  >
                    {header}
                  </Table.Th>
                ))}
                {(model.endpoints.update || model.endpoints.delete) && (
                  <Table.Th
                    style={{
                      width: 80,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--mantine-color-dimmed)',
                      paddingTop: 10,
                      paddingBottom: 10,
                    }}
                  >
                    Actions
                  </Table.Th>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <AnimatePresence>
                {rows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td
                      colSpan={
                        visibleFields.length +
                        lookupColumns.length +
                        1
                      }
                    >
                      <Stack align="center" py="xl" gap="xs">
                        <Text c="dimmed" style={{ opacity: 0.4 }}>
                          <InboxIcon />
                        </Text>
                        <Text c="dimmed" size="sm">
                          No records found
                        </Text>
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  sortedRows.map((row, i) => (
                    <motion.tr
                      key={toStr(row['id'] ?? i)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.02 }}
                      style={{
                        borderBottom: '1px solid var(--mantine-color-dark-5)',
                      }}
                    >
                      {visibleFields.map(([name, field]) => (
                        <Table.Td key={name} style={{ maxWidth: 220 }}>
                          <CellValue value={row[name]} fieldType={field.type} />
                        </Table.Td>
                      ))}
                      {lookupColumns.map(({ name, field }) => (
                        <Table.Td
                          key={`lookup-${name}`}
                          style={{ maxWidth: 160 }}
                        >
                          <LookupCell
                            value={row[name]}
                            field={field}
                            scheme={scheme}
                          />
                        </Table.Td>
                      ))}
                      {(model.endpoints.update || model.endpoints.delete) && (
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            {model.endpoints.update && (
                              <Tooltip label="Edit" position="left" withArrow>
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  color="blue"
                                  onClick={() => onEdit(row)}
                                >
                                  <PencilIcon />
                                </ActionIcon>
                              </Tooltip>
                            )}
                            {model.endpoints.delete && (
                              <Tooltip label="Delete" position="left" withArrow>
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  color="red"
                                  onClick={() =>
                                    setPendingDeleteId(toStr(row['id']))
                                  }
                                >
                                  <TrashIcon />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      )}
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal
        opened={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title={<Text fw={600}>Delete {model.name}</Text>}
        centered
        size="sm"
        radius="md"
      >
        <Text size="sm" c="dimmed" mb="lg">
          This action cannot be undone. The record will be permanently removed.
        </Text>
        <Group justify="flex-end">
          <Button
            variant="default"
            radius="md"
            onClick={() => setPendingDeleteId(null)}
          >
            Cancel
          </Button>
          <Button
            color="red"
            radius="md"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (pendingDeleteId) {
                deleteMutation.mutate(pendingDeleteId);
                setPendingDeleteId(null);
              }
            }}
          >
            Delete
          </Button>
        </Group>
      </Modal>

      <PaginationControls
        pagination={pagination}
        page={page}
        totalPages={totalPages}
        hasNextCursor={!!nextCursor}
        hasPrevCursor={cursorHistory.length > 0}
        onPageChange={(p) => {
          setPage(p);
        }}
        onNext={goToNext}
        onPrev={goToPrev}
      />
    </motion.div>
  );
}

interface PaginationControlsProps {
  pagination: CmsPagination | undefined;
  page: number;
  totalPages: number;
  hasNextCursor: boolean;
  hasPrevCursor: boolean;
  onPageChange: (page: number) => void;
  onNext: () => void;
  onPrev: () => void;
}

function PaginationControls({
  pagination,
  page,
  totalPages,
  hasNextCursor,
  hasPrevCursor,
  onPageChange,
  onNext,
  onPrev,
}: PaginationControlsProps) {
  if (!pagination || pagination.style === 'none') return null;

  if (pagination.style === 'cursor') {
    return (
      <Group justify="flex-end" mt="md" gap="xs">
        <Button
          size="xs"
          variant="default"
          radius="md"
          disabled={!hasPrevCursor}
          onClick={onPrev}
        >
          ← Previous
        </Button>
        <Button
          size="xs"
          radius="md"
          disabled={!hasNextCursor}
          onClick={onNext}
        >
          Next →
        </Button>
      </Group>
    );
  }

  if (totalPages <= 1) return null;

  return (
    <Group justify="flex-end" mt="md">
      <Pagination
        total={totalPages}
        value={page}
        onChange={onPageChange}
        size="sm"
        radius="md"
      />
    </Group>
  );
}

function extractNextCursor(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  for (const key of [
    'nextCursor',
    'next_cursor',
    'cursor',
    'next',
    'nextPageToken',
    'next_page_token',
    'after',
  ]) {
    if (typeof d[key] === 'string' && d[key]) return d[key] as string;
  }
  return null;
}

function CellValue({
  value,
  fieldType,
}: {
  value: unknown;
  fieldType: string;
}) {
  if (value == null)
    return (
      <Text c="dimmed" size="sm">
        —
      </Text>
    );
  if (fieldType === 'boolean') {
    return (
      <Badge
        color={value ? 'teal' : 'red'}
        variant="light"
        size="sm"
        radius="sm"
      >
        {value ? 'Yes' : 'No'}
      </Badge>
    );
  }
  if (typeof value === 'object') {
    return (
      <Text
        size="xs"
        c="dimmed"
        ff="monospace"
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 200,
        }}
      >
        {JSON.stringify(value)}
      </Text>
    );
  }
  return (
    <Text
      size="sm"
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {toStr(value)}
    </Text>
  );
}

function LookupCell({
  value,
  field,
  scheme,
}: {
  value: unknown;
  field: CmsField;
  scheme?: string;
}) {
  const lookup = field.lookup!;
  const client = createApiClient(scheme);
  const limit = lookup.limit ?? 100;
  const url = `${lookup.path}?limit=${limit}`;
  const { data } = useQuery({
    queryKey: ['lookup', lookup.path, 'all', limit],
    queryFn: () => client.get<unknown>(url),
    staleTime: 30_000,
  });

  const items: unknown[] = Array.isArray(data)
    ? data
    : data != null &&
        typeof data === 'object' &&
        Array.isArray((data as Record<string, unknown>)['data'])
      ? ((data as Record<string, unknown>)['data'] as unknown[])
      : [];

  const valueKey = lookup.valueField ?? 'id';
  const match = items.find(
    (item) =>
      toStr((item as Record<string, unknown>)[valueKey]) === toStr(value),
  );
  const label = match
    ? toStr((match as Record<string, unknown>)[lookup.labelField])
    : toStr(value);

  return (
    <Text
      size="sm"
      c="blue.4"
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label || '—'}
    </Text>
  );
}
