import type { MurmurEventType } from '@/api/types';

/** Front-end intake limits — the DropZone subtitle states the same 50 MB. */
export const MAX_FILE_MB = 50;
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.epub'] as const;
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.join(',');

export type RejectReason = 'format' | 'size';

export interface Rejection {
  name: string;
  reason: RejectReason;
}

/**
 * Split one drop / pick into files that may proceed and one rejection per bad
 * file (03 A 區：每檔一列). Format is checked before size, so a 60 MB .mobi is
 * reported as a format problem — the size of a file we can't read is moot.
 */
export function partitionFiles<T extends { name: string; size: number }>(
  files: readonly T[],
): { valid: T[]; rejected: Rejection[] } {
  const valid: T[] = [];
  const rejected: Rejection[] = [];
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      rejected.push({ name: file.name, reason: 'format' });
    } else if (file.size > MAX_FILE_MB * 1024 * 1024) {
      rejected.push({ name: file.name, reason: 'size' });
    } else {
      valid.push(file);
    }
  }
  return { valid, rejected };
}

/** Queue rows after the form's file: the form is 01, so the list starts at 02. */
export function queueNo(indexInRest: number): string {
  return String(indexInRest + 2).padStart(2, '0');
}

/**
 * Murmur type → kit pill variant (`.ss-pill-<variant>`). `org` is a naming
 * bridge; `symbol` folds into `concept` (已裁決：不新增 .ss-pill-symbol、不落 other).
 * `topic` and `raw` aren't entities and return null.
 */
const PILL_VARIANT: Partial<Record<MurmurEventType, string>> = {
  character: 'character',
  location: 'location',
  org: 'organization',
  event: 'event',
  symbol: 'concept',
};

export function murmurPillVariant(type: MurmurEventType): string | null {
  return PILL_VARIANT[type] ?? null;
}

/** "已處理 mm:ss" — minutes keep growing past 59 rather than rolling into hours. */
export function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
