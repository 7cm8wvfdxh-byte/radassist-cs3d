// Unified HTTP client for RadAssist
// Single place for all fetch calls — consistent error handling, auth headers

/** Get session auth token for API calls */
function getAuthToken(): string {
  return sessionStorage.getItem('ra_auth') === '1' ? '1' : '';
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip auth header (for /api/auth itself) */
  skipAuth?: boolean;
}

interface FetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/** Unified fetch wrapper with auth and error handling */
export async function apiFetch<T = unknown>(
  url: string,
  opts: FetchOptions = {}
): Promise<FetchResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers,
  };

  if (!opts.skipAuth) {
    const token = getAuthToken();
    if (token) {
      headers['X-RA-Auth'] = token;
    }
  }

  const res = await fetch(url, {
    method: opts.method || 'POST',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  // Handle non-JSON responses (e.g. Vercel 413 "Request Entity Too Large")
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    const errorMsg = text.slice(0, 100) || `HTTP ${res.status}`;
    throw new Error(errorMsg);
  }

  const data = await res.json() as T;
  return { ok: res.ok, status: res.status, data };
}

/** Fire-and-forget POST (for logging, bug reports) — never throws */
export async function apiPost(url: string, body: unknown): Promise<void> {
  try {
    await apiFetch(url, { body });
  } catch {
    // Fail silently — non-critical operations shouldn't break the app
  }
}
