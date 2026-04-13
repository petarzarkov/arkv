import { useState } from 'react';
import {
  Button,
  Group,
  Stack,
  Title,
  Divider,
  Alert,
  Paper,
} from '@mantine/core';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from '../api-client.js';
import { toStr } from '../utils.js';
import { FieldRenderer } from './FieldRenderer.js';
import type { CmsField, CmsModel } from '../types.js';

interface Props {
  model: CmsModel;
  initial?: Record<string, unknown>;
  mode: 'create' | 'edit';
  scheme?: string;
  onBack: () => void;
}

export function DynamicForm({ model, initial, mode, scheme, onBack }: Props) {
  const client = createApiClient(scheme);
  const qc = useQueryClient();

  // create mode uses createSchema (POST body fields); edit mode uses schema (response fields)
  const activeSchema: Record<string, CmsField> =
    mode === 'create' ? (model.createSchema ?? model.schema) : model.schema;

  const writableFields: [string, CmsField][] = Object.entries(
    activeSchema,
  ).filter((entry): entry is [string, CmsField] => !entry[1].readOnly);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (mode === 'edit' && initial) {
      return Object.fromEntries(
        writableFields.map(([name, field]) => [
          name,
          coerce(field, initial[name]),
        ]),
      );
    }
    return {};
  });
  const [error, setError] = useState<string | null>(null);

  function handleChange(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function buildPayload(): Record<string, unknown> {
    return Object.fromEntries(
      writableFields
        .map(([name, field]) => [name, coerce(field, values[name])] as const)
        .filter(([, v]) => v !== undefined),
    );
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (mode === 'create' && model.endpoints.create) {
        return client.post(model.endpoints.create.path, payload);
      }
      if (mode === 'edit' && model.endpoints.update) {
        const id = toStr(initial?.['id']);
        const path = model.endpoints.update.path
          .replace('{id}', id)
          .replace(':id', id);
        const method = model.endpoints.update.method;
        return method === 'PUT'
          ? client.put(path, payload)
          : client.patch(path, payload);
      }
      throw new Error('No endpoint configured for this action');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['list', model.name] });
      onBack();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Request failed'),
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Group mb="md">
        <Button variant="subtle" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <Title order={4}>
          {mode === 'create' ? `Create ${model.name}` : `Edit ${model.name}`}
        </Title>
      </Group>

      <Divider mb="lg" />

      {error && (
        <Alert
          color="red"
          mb="md"
          radius="md"
          withCloseButton
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      <Paper
        withBorder
        shadow="xs"
        radius="md"
        p="lg"
        maw={{ base: '100%', sm: 560 }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <Stack gap="md">
            {writableFields.map(([name, field]) => (
              <FieldRenderer
                key={name}
                name={name}
                field={field}
                value={values[name]}
                onChange={handleChange}
                scheme={scheme}
              />
            ))}

            <Group mt="xs">
              <Button type="submit" radius="md" loading={mutation.isPending}>
                {mode === 'create' ? 'Create' : 'Save changes'}
              </Button>
              <Button variant="default" radius="md" onClick={onBack}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </motion.div>
  );
}

function coerce(field: CmsField, value: unknown): unknown {
  if (field.type === 'number' && typeof value === 'string' && value !== '') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if ((field.type === 'object' || field.type === 'array') && value == null) {
    return undefined;
  }
  if (
    (field.type === 'object' || field.type === 'array') &&
    typeof value === 'string'
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
