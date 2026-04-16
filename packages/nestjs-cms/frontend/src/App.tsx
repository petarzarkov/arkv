import { useEffect } from 'react';
import {
  ActionIcon,
  AppShell,
  Loader,
  Center,
  Alert,
  Tooltip,
  Burger,
  Group,
  Menu,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Login } from './components/Login.js';
import { Sidebar } from './components/Sidebar.js';
import { ModelView } from './components/ModelView.js';
import { useCmsStore } from './store.js';
import { clearToken, getToken } from './api-client.js';
import type { CmsBlueprint } from './types.js';

const SCHEMA_URL = './schema';

const DEFAULT_LOGO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231971c2'/%3E%3Ctext x='16' y='23' font-family='system-ui%2C-apple-system%2Csans-serif' font-size='20' font-weight='700' text-anchor='middle' fill='white'%3EA%3C/text%3E%3C/svg%3E";
const logoSrc = window.__CMS_LOGO__ ?? DEFAULT_LOGO;
const cmsTitle = window.__CMS_TITLE__ ?? 'CMS';

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
    activeModel,
    colorScheme,
    toggleColorScheme,
    authenticated,
    setAuthenticated,
    user,
    setUser,
  } = useCmsStore();
  const [opened, { toggle, close }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  const { data, isLoading, isError, error } = useQuery<CmsBlueprint>({
    queryKey: ['cms-schema'],
    queryFn: () =>
      fetch(SCHEMA_URL).then((r) => r.json() as Promise<CmsBlueprint>),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    setBlueprint(data);
    document.title = data.title || cmsTitle;

    if (window.__CMS_LOGO__) {
      const link = document.querySelector(
        "link[rel='icon']",
      ) as HTMLLinkElement | null;
      if (link) link.href = window.__CMS_LOGO__;
    }

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

  function handleSignOut() {
    clearToken();
    setUser(null);
    setAuthenticated(false);
  }

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
      navbar={{
        width: 220,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: !desktopOpened },
      }}
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
            <Text fw={700} size="sm" c="violet.4">
              {data.title}
            </Text>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={toggleDesktop}
              visibleFrom="sm"
              style={{
                transition: 'transform 150ms ease',
                transform: desktopOpened ? 'rotate(0deg)' : 'rotate(180deg)',
              }}
            >
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
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </ActionIcon>
          </Group>
          <Group gap="xs">
            <Tooltip
              label={colorScheme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              <ActionIcon
                variant="subtle"
                onClick={toggleColorScheme}
                size="sm"
              >
                {colorScheme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </ActionIcon>
            </Tooltip>
            {data.auth.required && (
              <Menu shadow="md" position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" size="md" radius="xl">
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
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {user && (
                    <>
                      {(user['email'] || user['name']) && (
                        <Menu.Label>
                          {(user['name'] as string) ??
                            (user['email'] as string) ??
                            ''}
                        </Menu.Label>
                      )}
                      <Menu.Divider />
                    </>
                  )}
                  <Menu.Item
                    color="red"
                    onClick={handleSignOut}
                    leftSection={
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
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    }
                  >
                    Sign out
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar
          blueprint={data}
          activeModel={activeModel}
          onSelect={() => close()}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        {blueprint && (
          <Routes>
            <Route
              path="/:model"
              element={<ModelRoute blueprint={blueprint} />}
            />
            <Route
              path="*"
              element={
                <Navigate
                  to={`/${Object.keys(blueprint.models).sort()[0] ?? ''}`}
                  replace
                />
              }
            />
          </Routes>
        )}
      </AppShell.Main>
    </AppShell>
  );
}

function ModelRoute({ blueprint }: { blueprint: CmsBlueprint }) {
  const { model: modelName } = useParams<{ model: string }>();
  const { setActiveModel } = useCmsStore();

  useEffect(() => {
    if (modelName) setActiveModel(modelName);
  }, [modelName, setActiveModel]);

  return <ModelView blueprint={blueprint} />;
}
