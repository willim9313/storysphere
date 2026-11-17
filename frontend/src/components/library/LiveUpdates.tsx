import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import { useEventStream, type StreamEvent } from '@/hooks/useEventStream';

const REFRESH_ON = new Set<StreamEvent['type']>(['job.status', 'ingest.step', 'resync']);

function useRefreshLibrary() {
  const client = useQueryClient();
  return (event: StreamEvent) => {
    if (!REFRESH_ON.has(event.type)) return;
    void client.invalidateQueries({ queryKey: queryKeys.books });
    void client.invalidateQueries({ queryKey: queryKeys.jobs });
  };
}

/** N-09f：訂一本書的事件，入庫狀態一變就重抓書單與 job。不渲染東西。 */
export function BookEvents({ bookId }: Readonly<{ bookId: string }>) {
  useEventStream(`/books/${encodeURIComponent(bookId)}/events`, useRefreshLibrary());
  return null;
}

/** N-09c：剛上傳、還沒有 bookId 的 ingest job（P1 寫入 books 之前）。 */
export function JobEvents({ jobId }: Readonly<{ jobId: string }>) {
  useEventStream(`/jobs/${encodeURIComponent(jobId)}/events`, useRefreshLibrary());
  return null;
}
