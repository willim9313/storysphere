// API 呼叫的共用入口（沿用舊 repo 的 client.ts，改成 /api/v2 與 04 §1.2 的錯誤格式）。
// 型別一律從 generated.ts 取，不手寫。
import type { components, paths } from './generated';

const BASE_URL = '/api/v2';

export type Schemas = components['schemas'];
export type { paths };

export class ApiError extends Error {
  status: number;
  detail: string;
  /** 04 §1.2 的機器可讀原因，例如 `job_conflict`、`invalid_state`。 */
  code: string | null;
  /** 回應有 JSON body。沒有＝後端沒開或代理出錯，不是頁面本身的錯。 */
  hasBody: boolean;

  constructor(status: number, detail: string, code: string | null, hasBody: boolean) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.hasBody = hasBody;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  if (body === null || typeof body !== 'object') {
    return new ApiError(res.status, res.statusText, null, false);
  }
  const { detail, code } = body as { detail?: unknown; code?: unknown };
  return new ApiError(
    res.status,
    typeof detail === 'string' ? detail : res.statusText,
    typeof code === 'string' ? code : null,
    true,
  );
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', body: formData });
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<T>;
}

/** SSE 串流的完整網址（EventSource 不經 apiFetch）。 */
export function streamUrl(path: string): string {
  return `${BASE_URL}${path}`;
}
