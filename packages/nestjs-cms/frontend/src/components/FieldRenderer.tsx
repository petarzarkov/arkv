import {
  TextInput,
  NumberInput,
  Switch,
  Select,
  Loader,
  Textarea,
  Text,
} from '@mantine/core';
import { useState, useRef } from 'react';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { createApiClient } from '../api-client.js';
import { toStr, toStrNullable } from '../utils.js';
import type { CmsField } from '../types.js';

interface Props {
  name: string;
  field: CmsField;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  scheme?: string;
}

export function FieldRenderer({ name, field, value, onChange, scheme }: Props) {
  const client = createApiClient(scheme);
  const label = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase());

  if (field.readOnly && field.type !== 'object' && field.type !== 'array') {
    return (
      <TextInput
        label={label}
        description={field.description}
        value={toStr(value)}
        readOnly
        disabled
      />
    );
  }

  if (field.lookup) {
    return (
      <LookupField
        name={name}
        field={field}
        value={value}
        onChange={onChange}
        label={label}
        client={client}
      />
    );
  }

  if (field.type === 'boolean') {
    return (
      <Switch
        label={label}
        description={field.description}
        checked={Boolean(value)}
        onChange={(e) => onChange(name, e.currentTarget.checked)}
      />
    );
  }

  if (field.type === 'number') {
    return (
      <NumberInput
        label={label}
        description={field.description}
        required={field.required}
        value={(value as number) ?? ''}
        onChange={(v) => onChange(name, v)}
      />
    );
  }

  if (field.type === 'enum' && field.options) {
    return (
      <Select
        label={label}
        description={field.description}
        required={field.required}
        data={field.options.map(toStr)}
        value={toStrNullable(value)}
        onChange={(v) => onChange(name, v)}
        clearable={!field.required}
      />
    );
  }

  if (field.type === 'date') {
    return (
      <DateInput
        label={label}
        description={field.description}
        required={field.required}
        value={(value as string) ?? null}
        onChange={(d) => onChange(name, d ?? null)}
      />
    );
  }

  if (field.type === 'object' || field.type === 'array') {
    if (field.readOnly) {
      const parsed =
        typeof value === 'string' ? (JSON.parse(value) as object) : value;
      return (
        <div>
          <Text size="sm" fw={500} mb={4}>
            {label}
          </Text>
          <div style={{ borderRadius: 6, overflow: 'auto', maxHeight: 300 }}>
            <JsonView data={parsed as object} style={darkStyles} />
          </div>
        </div>
      );
    }
    return (
      <JsonTextarea
        name={name}
        label={label}
        field={field}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.format === 'email') {
    return (
      <TextInput
        label={label}
        description={field.description}
        required={field.required}
        type="email"
        value={toStr(value)}
        onChange={(e) => onChange(name, e.currentTarget.value)}
      />
    );
  }

  if (field.format === 'password') {
    return (
      <TextInput
        label={label}
        description={field.description}
        required={field.required}
        type="password"
        value={toStr(value)}
        onChange={(e) => onChange(name, e.currentTarget.value)}
      />
    );
  }

  return (
    <TextInput
      label={label}
      description={field.description}
      required={field.required}
      value={toStr(value)}
      onChange={(e) => onChange(name, e.currentTarget.value)}
    />
  );
}

function LookupField({
  name,
  field,
  value,
  onChange,
  label,
  client,
}: {
  name: string;
  field: CmsField;
  value: unknown;
  onChange: (n: string, v: unknown) => void;
  label: string;
  client: ReturnType<typeof createApiClient>;
}) {
  const lookup = field.lookup!;
  const isServerSearch = Boolean(lookup.searchParam);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(val: string) {
    setSearchValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }

  function buildUrl(): string {
    const params = new URLSearchParams();
    if (isServerSearch) {
      if (debouncedSearch) params.set(lookup.searchParam!, debouncedSearch);
      params.set('limit', String(lookup.limit ?? 20));
    } else {
      params.set('limit', String(lookup.limit ?? 100));
    }
    return `${lookup.path}?${params.toString()}`;
  }

  const { data, isFetching } = useQuery({
    queryKey: [
      'lookup',
      lookup.path,
      isServerSearch ? debouncedSearch : 'all',
      lookup.limit,
    ],
    queryFn: () => client.get<unknown>(buildUrl()),
    staleTime: 30_000,
    enabled: !isServerSearch || debouncedSearch.length > 0,
  });

  const items: unknown[] = Array.isArray(data)
    ? data
    : data != null &&
        typeof data === 'object' &&
        Array.isArray((data as Record<string, unknown>)['data'])
      ? ((data as Record<string, unknown>)['data'] as unknown[])
      : [];

  const options = items.map((item) => {
    const obj = item as Record<string, unknown>;
    const id = toStr(obj[lookup.valueField ?? 'id']);
    const itemLabel = toStr(obj[lookup.labelField]);
    return { value: id, label: `${id} (${itemLabel})` };
  });

  // In server-search mode, ensure the current value always appears as an option
  // so the Select can display it before the user starts typing.
  const currentStr = toStrNullable(value);
  if (
    isServerSearch &&
    currentStr &&
    !options.find((o) => o.value === currentStr)
  ) {
    options.unshift({ value: currentStr, label: currentStr });
  }

  return (
    <Select
      label={label}
      description={field.description}
      required={field.required}
      data={options}
      value={currentStr}
      searchable
      clearable={!field.required}
      rightSection={isFetching ? <Loader size="xs" /> : undefined}
      onSearchChange={isServerSearch ? handleSearchChange : undefined}
      searchValue={isServerSearch ? searchValue : undefined}
      nothingFoundMessage={
        isServerSearch && debouncedSearch.length === 0
          ? 'Type to search…'
          : 'No results'
      }
      onChange={(v) => {
        if (v == null) {
          onChange(name, null);
          return;
        }
        onChange(name, field.type === 'number' ? Number(v) : v);
      }}
    />
  );
}

function JsonTextarea({
  name,
  label,
  field,
  value,
  onChange,
}: {
  name: string;
  label: string;
  field: CmsField;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}) {
  const serialize = (v: unknown) =>
    v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2);

  const [raw, setRaw] = useState(serialize(value));
  const [jsonError, setJsonError] = useState<string | null>(null);

  function handleChange(text: string) {
    setRaw(text);
    if (text.trim() === '') {
      setJsonError(null);
      onChange(name, null);
      return;
    }
    try {
      onChange(name, JSON.parse(text));
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON');
    }
  }

  return (
    <>
      <Textarea
        label={label}
        description={field.description}
        required={field.required}
        value={raw}
        onChange={(e) => handleChange(e.currentTarget.value)}
        autosize
        minRows={3}
        maxRows={8}
        ff="monospace"
        error={jsonError}
      />
      {!jsonError && raw.trim() && (
        <Text size="xs" c="dimmed">
          Valid JSON
        </Text>
      )}
    </>
  );
}
