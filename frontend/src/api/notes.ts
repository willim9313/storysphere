import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';
import { queryKeys } from './queryKeys';

export type NoteListItem = Schemas['NoteListItem'];
export type NoteDetail = Schemas['NoteDetail'];

const base = (bookId: string) => `/books/${encodeURIComponent(bookId)}`;

/** N-06a 筆記列表（新到舊；原型筆記不多，一次取 200）。 */
export function useNotes(bookId: string) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'notes'),
    queryFn: () => apiFetch<Schemas['NotePage']>(`${base(bookId)}/notes?limit=200`),
  });
}

/** N-06b 單篇筆記。 */
export function useNote(bookId: string, noteId: string | null) {
  return useQuery({
    queryKey: queryKeys.bookData(bookId, 'notes', noteId),
    enabled: noteId !== null,
    queryFn: () => apiFetch<NoteDetail>(`${base(bookId)}/notes/${encodeURIComponent(noteId!)}`),
  });
}

/** N-06c 從結果卡存成筆記（按下＝人工審核）。 */
export function useCreateNote(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { fromRunId: string; title: string; conclusion: string; citedEvidenceIds: string[] }) =>
      apiFetch<Schemas['NoteCreated']>(`${base(bookId)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ origin: 'run', ...body }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.bookData(bookId, 'notes') }),
  });
}

/** N-06d 筆記重跑（會呼叫 LLM）；筆記本身不變。 */
export function useRerunNote(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiFetch<Schemas['TriggerOut']>(`${base(bookId)}/notes/${encodeURIComponent(noteId)}/rerun`, {
        method: 'POST',
        body: '{}',
      }),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.jobs }),
  });
}

/** N-06e 使用者加詮釋。 */
export function useAddInterpretation(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; citedEvidenceIds: string[] }) =>
      apiFetch<Schemas['InterpretationCreated']>(`${base(bookId)}/interpretations`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.bookData(bookId, 'notes') }),
  });
}
