import type { MurmurEvent } from '@/api/types';

// Module-level maps survive component unmount/remount and page navigation
const eventMap = new Map<string, MurmurEvent[]>();
const cursorMap = new Map<string, number>();

export function getMurmurEvents(taskId: string): MurmurEvent[] {
  return eventMap.get(taskId) ?? [];
}

export function appendMurmurEvents(taskId: string, delta: MurmurEvent[]): void {
  if (!delta.length) return;
  const existing = eventMap.get(taskId) ?? [];
  const seenSeqs = new Set(existing.map((e) => e.seq));
  const deduped = delta.filter((e) => !seenSeqs.has(e.seq));
  if (deduped.length === 0) return;
  eventMap.set(taskId, [...existing, ...deduped]);
}

export function getMurmurCursor(taskId: string): number {
  return cursorMap.get(taskId) ?? 0;
}

export function advanceMurmurCursor(taskId: string, count: number): void {
  cursorMap.set(taskId, (cursorMap.get(taskId) ?? 0) + count);
}

export function clearMurmur(taskId: string): void {
  eventMap.delete(taskId);
  cursorMap.delete(taskId);
}
