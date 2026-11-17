import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';
import { queryKeys } from './queryKeys';

export type Job = Schemas['Job'];

// 04 §3.2：可以續跑的狀態、已結束的狀態。
export const RESUMABLE = new Set(['paused_quota', 'interrupted']);
export const TERMINAL = new Set(['done', 'error', 'cancelled']);

/** N-09a：所有未結束的 job＋最近結束的幾筆，新到舊。 */
export function useJobs(options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.jobs,
    queryFn: () => apiFetch<Job[]>('/jobs'),
    refetchInterval: options.refetchInterval,
  });
}

/** 改了 job 狀態之後，書單、job 清單、該書的入庫狀態都要重抓。 */
function useInvalidateJobState() {
  const client = useQueryClient();
  return (bookId: string | null | undefined) => {
    void client.invalidateQueries({ queryKey: queryKeys.jobs });
    void client.invalidateQueries({ queryKey: queryKeys.books });
    if (bookId) void client.invalidateQueries({ queryKey: queryKeys.ingest(bookId) });
  };
}

/** N-09d 終止。 */
export function useCancelJob() {
  const invalidate = useInvalidateJobState();
  return useMutation({
    mutationFn: (job: Pick<Job, 'id' | 'bookId'>) =>
      apiFetch<void>(`/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST' }),
    onSettled: (_data, _error, job) => invalidate(job.bookId),
  });
}

/** N-09e 續跑（暫停或中斷的 job；會呼叫 LLM）。 */
export function useResumeJob() {
  const invalidate = useInvalidateJobState();
  return useMutation({
    mutationFn: (job: Pick<Job, 'id' | 'bookId'>) =>
      apiFetch<Schemas['JobAccepted']>(`/jobs/${encodeURIComponent(job.id)}/resume`, {
        method: 'POST',
      }),
    onSettled: (_data, _error, job) => invalidate(job.bookId),
  });
}
