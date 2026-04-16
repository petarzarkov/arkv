import { useState } from 'react';
import {
  TextInput,
  PasswordInput,
  Button,
  Paper,
  Title,
  Alert,
  Stack,
} from '@mantine/core';
import { login } from '../api-client.js';
import { useCmsStore } from '../store.js';
import type { CmsAuth } from '../types.js';

interface Props {
  auth: CmsAuth;
  onSuccess: () => void;
}

export function Login({ auth, onSuccess }: Props) {
  const { setUser } = useCmsStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.loginEndpoint) return;
    setError(null);
    setLoading(true);
    try {
      const data = await login(
        auth.loginEndpoint,
        email,
        password,
        auth.tokenPath,
      );
      setUser(data);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--mantine-color-dark-8)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '0 1rem',
          animation: 'fadeSlideUp 0.4s ease-out',
        }}
      >
        <Paper p="xl" radius="md" shadow="xl" withBorder>
          <Title order={2} mb="xl" ta="center">
            Sign in
          </Title>
          {error && (
            <Alert color="red" mb="md" radius="md">
              {error}
            </Alert>
          )}
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
              <PasswordInput
                label="Password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
              <Button
                type="submit"
                loading={loading}
                fullWidth
                mt="sm"
                size="md"
              >
                Sign in
              </Button>
            </Stack>
          </form>
        </Paper>
      </div>
    </div>
  );
}
