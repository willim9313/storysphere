const BASE_URL = import.meta.env.VITE_API_BASE || '/api/v1';

export class ApiError extends Error {
  status: number;
  detail: string;
  /** The response carried an application JSON body. This — not the status
   *  code — is what tells a page failure from a backend outage: the app always
   *  answers in JSON (its 500s and 503s included), while a dev-proxy error or a
   *  gateway's bare 502/503/504 has no JSON body. See `failureKind`. */
  hasBody: boolean;
  /** Machine-readable reason some endpoints add next to `detail`. */
  code: string | null;

  constructor(status: number, detail: string, hasBody = true, code: string | null = null) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.hasBody = hasBody;
    this.code = code;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  if (body === null || typeof body !== 'object') {
    return new ApiError(res.status, res.statusText, false);
  }
  const code = typeof body.code === 'string' ? body.code : (body.error?.code ?? null);
  return new ApiError(res.status, body.error?.message ?? body.detail ?? res.statusText, true, code);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw await toApiError(res);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData, signal?: AbortSignal): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { method: 'POST', body: formData, signal });

  if (!res.ok) {
    throw await toApiError(res);
  }

  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { method: 'DELETE' });

  if (!res.ok) {
    throw await toApiError(res);
  }
}
