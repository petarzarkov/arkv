import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
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
  primaryColor: 'blue',
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

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      forceColorScheme={colorScheme}
    >
      <QueryClientProvider client={queryClient}>
        <App />
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
