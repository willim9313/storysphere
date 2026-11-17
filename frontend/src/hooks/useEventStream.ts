import { useEffect, useRef } from 'react';
import { streamUrl } from '@/api/client';

// 04 §3.5 的事件型別。EventSource 只把沒具名的事件送進 onmessage，具名的要逐一掛。
const EVENT_TYPES = [
  'job.status',
  'ingest.step',
  'ingest.unit',
  'run.status',
  'basis.changed',
  'resync',
] as const;

// 04 §5.1 AgentEvent 的型別（N-10e），加上補不了時的 resync。
export const AGENT_EVENT_TYPES = [
  'text_delta',
  'tool_call',
  'tool_result',
  'approval_request',
  'view',
  'note_draft',
  'done',
  'error',
  'resync',
] as const;

export interface StreamEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * 訂閱一條 SSE 串流（N-09c 單一 job、N-09f 整本書；傳 `AGENT_EVENT_TYPES` 時是 N-10e）。
 *
 * 斷線時瀏覽器會自己帶 `Last-Event-ID` 重連，後端補送漏掉的事件；補不了時送 `resync`，
 * 呼叫端收到就重抓 REST 狀態。`path` 為 null 時不連。
 */
export function useEventStream(
  path: string | null,
  onEvent: (event: StreamEvent) => void,
  types: readonly string[] = EVENT_TYPES,
) {
  // 用 ref 拿最新的 callback，避免每次 render 都重連。
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (path === null) return;
    const source = new EventSource(streamUrl(path));
    const listeners = types.map((type) => {
      const listener = (message: MessageEvent<string>) => {
        let data: Record<string, unknown> = {};
        try {
          data = message.data ? (JSON.parse(message.data) as Record<string, unknown>) : {};
        } catch {
          // 壞掉的一筆不影響之後的事件。
        }
        handler.current({ type, data });
      };
      source.addEventListener(type, listener);
      return [type, listener] as const;
    });
    return () => {
      for (const [type, listener] of listeners) source.removeEventListener(type, listener);
      source.close();
    };
  }, [path, types]);
}
