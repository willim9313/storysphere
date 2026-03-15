const BASE_URL = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
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
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new ApiError(res.status, body.error?.message ?? body.detail ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { method: 'POST', body: formData });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new ApiError(res.status, body.error?.message ?? body.detail ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { method: 'DELETE' });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new ApiError(res.status, body.error?.message ?? body.detail ?? res.statusText);
  }
}
