import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';
import { queryKeys } from './queryKeys';

export type SessionDetail = Schemas['SessionDetail'];
export type SessionListItem = Schemas['SessionListItem'];
export type TraceItem = Schemas['TraceItem'];
export type NoteDraft = Schemas['NoteDraft'];
export type BrainSettings = Schemas['BrainSettingsOut'];
export type Methodology = Schemas['MethodologyOut'];

const sessionPath = (sessionId: string) => `/agent/sessions/${encodeURIComponent(sessionId)}`;

/** session 層的 query key 都掛在 ['agent', sessionId, …] 底下：SSE 收到 resync 時整個 invalidate。 */
export const agentKeys = {
  session: (sessionId: string, ...rest: unknown[]) => ['agent', sessionId, ...rest] as const,
};

/** N-08e 大腦設定（預設後端、deepagents 的模型、Claude Code 是否可用）。 */
export function useBrainSettings() {
  return useQuery({
    queryKey: ['settings', 'brain'],
    queryFn: () => apiFetch<BrainSettings>('/settings/brain'),
  });
}

/** N-10b 這本書的 session（新到舊）。 */
export function useSessions(bookId: string) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'agent-sessions'),
    queryFn: () => apiFetch<SessionListItem[]>(`/books/${encodeURIComponent(bookId)}/agent/sessions`),
  });
}

/** N-10c 單一 session；開啟中或忙碌時每秒重抓（狀態變化沒有事件）。 */
export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: agentKeys.session(sessionId ?? '', 'detail'),
    enabled: sessionId !== null,
    queryFn: () => apiFetch<SessionDetail>(sessionPath(sessionId!)),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'starting' || status === 'busy' ? 1000 : false;
    },
  });
}

/** N-10i 工具呼叫紀錄（原型的 session 不長，一次取 200 筆）。 */
export function useSessionTrace(sessionId: string | null) {
  return useQuery({
    queryKey: agentKeys.session(sessionId ?? '', 'trace'),
    enabled: sessionId !== null,
    queryFn: () => apiFetch<Schemas['TracePage']>(`${sessionPath(sessionId!)}/trace?limit=200`),
  });
}

/** N-10j 筆記草稿。 */
export function useDrafts(sessionId: string | null) {
  return useQuery({
    queryKey: agentKeys.session(sessionId ?? '', 'drafts'),
    enabled: sessionId !== null,
    queryFn: () => apiFetch<NoteDraft[]>(`${sessionPath(sessionId!)}/drafts`),
  });
}

/** N-10a 開 session。 */
export function useOpenSession(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Schemas['SessionIn'], 'bookId'>) =>
      apiFetch<Schemas['SessionOut']>('/agent/sessions', {
        method: 'POST',
        body: JSON.stringify({ ...body, bookId }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.bookData(bookId, 'agent-sessions') }),
  });
}

/** N-10h 關閉 session（open 的草稿會被標成 discarded）。 */
export function useCloseSession(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiFetch<void>(sessionPath(sessionId), { method: 'DELETE' }),
    onSettled: (_data, _error, sessionId) => {
      void client.invalidateQueries({ queryKey: queryKeys.bookData(bookId, 'agent-sessions') });
      void client.invalidateQueries({ queryKey: agentKeys.session(sessionId) });
    },
  });
}

/** N-10d 送訊息（會呼叫大腦）。 */
export function useSendMessage(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch<Schemas['TurnOut']>(`${sessionPath(sessionId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    onSettled: () => client.invalidateQueries({ queryKey: agentKeys.session(sessionId, 'detail') }),
  });
}

/** N-10g 中止這一輪。 */
export function useCancelTurn(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`${sessionPath(sessionId)}/cancel`, { method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: agentKeys.session(sessionId) }),
  });
}

/** N-10f 回應寫入確認。 */
export function useResolveApproval(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, allow }: { requestId: string; allow: boolean }) =>
      apiFetch<void>(`${sessionPath(sessionId)}/approvals/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        body: JSON.stringify({ allow }),
      }),
    onSettled: () => client.invalidateQueries({ queryKey: agentKeys.session(sessionId, 'trace') }),
  });
}

/** N-10k 捨棄草稿。 */
export function useDiscardDraft(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) =>
      apiFetch<void>(`${sessionPath(sessionId)}/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' }),
    onSettled: () => client.invalidateQueries({ queryKey: agentKeys.session(sessionId, 'drafts') }),
  });
}

/** N-06c `origin=draft`：確認草稿存成筆記。只帶使用者改過的欄位（帶了＝改過，04 N-06c）。 */
export function useConfirmDraft(bookId: string, sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { draftId: string; title?: string; conclusion?: string; citedEvidenceIds?: string[] }) =>
      apiFetch<Schemas['NoteCreated']>(`/books/${encodeURIComponent(bookId)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ origin: 'draft', sessionId, ...body }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: agentKeys.session(sessionId, 'drafts') });
      void client.invalidateQueries({ queryKey: queryKeys.bookData(bookId, 'notes') });
    },
  });
}

/** N-07e 另存方法論（原型只有 fromSession：該輪的 run_method 順序）。 */
export function useSaveMethodology() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { question: string; sessionId: string; turnId: string }) =>
      apiFetch<Methodology>('/registry/methodologies', {
        method: 'POST',
        body: JSON.stringify({ question: body.question, fromSession: { sessionId: body.sessionId, turnId: body.turnId } }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['registry'] }),
  });
}
