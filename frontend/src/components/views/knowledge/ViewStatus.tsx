import { ApiError } from '@/api/client';

/** 讀取中／錯誤／沒資料的共用一行（knowledge_matrix、character_arc）。 */
export function ViewStatus({ isLoading, error, empty }: Readonly<{ isLoading: boolean; error: unknown; empty: string }>) {
  if (isLoading) return <p style={{ margin: 0, color: 'var(--fg-muted)' }}>讀取中…</p>;
  if (error) {
    return (
      <p role="alert" style={{ margin: 0, color: 'var(--color-error)' }}>
        讀不到資料：{error instanceof ApiError ? error.detail : String(error)}
      </p>
    );
  }
  return <p style={{ margin: 0, color: 'var(--fg-muted)' }}>{empty}</p>;
}
