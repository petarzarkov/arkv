import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import './animations.css';
import { App } from './App.js';
import { useCmsStore } from './store.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  components: {
    Table: {
      defaultProps: { striped: true, highlightOnHover: true },
    },
  },
});

function Root() {
  const colorScheme = useCmsStore((s) => s.colorScheme);
  const base =
    document.querySelector('base')?.getAttribute('href')?.replace(/\/$/, '') ||
    '/cms';

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      forceColorScheme={colorScheme}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={base}>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

const el = document.getElementById('app');
if (!el) throw new Error('Missing #app element');

createRoot(el).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
