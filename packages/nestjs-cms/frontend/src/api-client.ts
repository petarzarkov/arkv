const TOKEN_KEY = 'cms_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function getNestedValue(obj: unknown, path: string): string | null {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : null;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  scheme?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token && scheme === 'bearer') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: scheme === 'cookie' ? 'include' : 'same-origin',
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    const { useCmsStore } = await import('./store.js');
    useCmsStore.getState().setAuthenticated(false);
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function createApiClient(scheme?: string) {
  return {
    get: <T>(path: string) => request<T>('GET', path, undefined, scheme),
    post: <T>(path: string, body: unknown) =>
      request<T>('POST', path, body, scheme),
    patch: <T>(path: string, body: unknown) =>
      request<T>('PATCH', path, body, scheme),
    put: <T>(path: string, body: unknown) =>
      request<T>('PUT', path, body, scheme),
    delete: (path: string) => request<void>('DELETE', path, undefined, scheme),
  };
}

export async function login(
  loginEndpoint: string,
  email: string,
  password: string,
  tokenPath = 'access_token',
): Promise<Record<string, unknown>> {
  const res = await fetch(loginEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const token = getNestedValue(data, tokenPath);
  if (!token) throw new Error('Could not extract token from login response');
  setToken(token);
  return data;
}
