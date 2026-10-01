import { ApiError } from './client';

/**
 * PROJECT_RULES · 失敗分類：判準是「回應有無應用層 JSON body」，不是狀態碼。
 *
 * - `page`    — the app answered (4xx/5xx with its own JSON, a 503 for "no LLM
 *               provider" included). The feature failed; the backend is up.
 * - `backend` — nothing came back (fetch rejected) or only a bare status from
 *               the proxy/gateway. Saying "the whole backend is down" is only
 *               honest here.
 */
export type FailureKind = 'page' | 'backend';

export function failureKind(err: unknown): FailureKind {
  return err instanceof ApiError && err.hasBody ? 'page' : 'backend';
}

/** "500 Internal Server Error" for the collapsible 技術細節 row. */
export function techDetailOf(err: unknown): string | undefined {
  if (err instanceof ApiError) return `${err.status} ${err.detail}`.trim();
  if (err instanceof Error) return err.message || undefined;
  return undefined;
}
