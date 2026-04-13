import { useEffect, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Loader,
  Center,
  Alert,
  Tooltip,
  Burger,
  Group,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { Login } from './components/Login.js';
import { Sidebar } from './components/Sidebar.js';
import { ModelView } from './components/ModelView.js';
import { useCmsStore } from './store.js';
import { getToken } from './api-client.js';
import type { CmsBlueprint } from './types.js';

const SCHEMA_URL = './schema';

const DEFAULT_LOGO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231971c2'/%3E%3Ctext x='16' y='23' font-family='system-ui%2C-apple-system%2Csans-serif' font-size='20' font-weight='700' text-anchor='middle' fill='white'%3EA%3C/text%3E%3C/svg%3E";
const logoSrc = window.__CMS_LOGO__ ?? DEFAULT_LOGO;

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="7.05" y2="7.05" />
      <line x1="16.95" y1="16.95" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="7.05" y2="16.95" />
      <line x1="16.95" y1="7.05" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function App() {
  const {
    blueprint,
    setBlueprint,
    setActiveModel,
    activeModel,
    colorScheme,
    toggleColorScheme,
  } = useCmsStore();
  const [authenticated, setAuthenticated] = useState(false);
  const [opened, { toggle, close }] = useDisclosure();

  const { data, isLoading, isError, error } = useQuery<CmsBlueprint>({
    queryKey: ['cms-schema'],
    queryFn: () =>
      fetch(SCHEMA_URL).then((r) => r.json() as Promise<CmsBlueprint>),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    setBlueprint(data);

    if (!data.auth.required) {
      setAuthenticated(true);
      return;
    }
    if (data.auth.scheme === 'cookie') {
      setAuthenticated(true);
      return;
    }
    if (getToken()) {
      setAuthenticated(true);
    }
  }, [data, setBlueprint]);

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (isError || !data) {
    return (
      <Center h="100vh">
        <Alert color="red" title="Failed to load schema" maw={420}>
          {error instanceof Error
            ? error.message
            : 'Could not reach /schema endpoint.'}
        </Alert>
      </Center>
    );
  }

  if (data.auth.required && !authenticated && data.auth.loginEndpoint) {
    return <Login auth={data.auth} onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <img
              src={logoSrc}
              alt="CMS logo"
              style={{ width: 24, height: 24, flexShrink: 0 }}
            />
            <Text fw={700} size="sm" c="blue.4">
              {data.title}
            </Text>
          </Group>
          <Tooltip label={colorScheme === 'dark' ? 'Light mode' : 'Dark mode'}>
            <ActionIcon variant="subtle" onClick={toggleColorScheme} size="sm">
              {colorScheme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar
          blueprint={data}
          activeModel={activeModel}
          onSelect={(model) => {
            setActiveModel(model);
            close();
          }}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        {blueprint && <ModelView blueprint={blueprint} />}
      </AppShell.Main>
    </AppShell>
  );
}
