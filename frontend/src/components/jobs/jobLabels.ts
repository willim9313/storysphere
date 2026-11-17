import type { Job } from '@/api/jobs';

// 04 §3.1 的 job 種類 → 卡片標題前綴。
const KIND_LABELS: Record<string, string> = {
  ingest: '入庫',
  ingest_retry: '重跑失敗單位',
  ingest_rerun: '重跑入庫',
  genre_s4: '補跑 S4',
  method_run: '分析',
  note_rerun: '重跑筆記',
  llm_test: '測試',
  brain_test: '測試',
};

// 入庫類 job 的 title 就是書名（後端建立時填入）；其他種類的 title 是任務本身的描述。
const INGEST_KINDS = new Set(['ingest', 'ingest_retry', 'ingest_rerun', 'genre_s4']);

export function isIngestKind(kind: string): boolean {
  return INGEST_KINDS.has(kind);
}

// 04 §3.2 狀態 → 徽章文字與色調（null＝中性）。
type Tone = 'info' | 'warning' | 'error' | 'success' | null;
const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: '排隊中', tone: null },
  running: { label: '執行中', tone: 'info' },
  awaiting_review: { label: '等待章節審閱', tone: 'info' },
  paused_quota: { label: '暫停：額度用完', tone: 'warning' },
  interrupted: { label: '已中斷', tone: 'warning' },
  done: { label: '完成', tone: 'success' },
  error: { label: '失敗', tone: 'error' },
  cancelled: { label: '已取消', tone: null },
};

export function statusInfo(status: string): { label: string; tone: Tone } {
  return STATUS[status] ?? { label: status, tone: null };
}

// 入庫步驟 key（04 §2.3 `stage`）→ 02 的步驟名稱。
const INGEST_STAGES: Record<string, string> = {
  p1: 'P1 文件處理',
  review: '章節審閱',
  s1: 'S1 核心抽取＋訊號',
  s2: 'S2 整併',
  s3: 'S3 題材判定',
  s4: 'S4 深度抽取＋整併',
  s5: 'S5 自動觸發',
};

export function stageLabel(job: Job): string | null {
  if (!job.stage || !isIngestKind(job.kind)) return null;
  return INGEST_STAGES[job.stage] ?? job.stage.toUpperCase();
}

/** 卡片標題：種類 · 書名 · （非入庫類）任務描述，例如「分析 · 四簽名 · MY5 …」。 */
export function jobTitle(job: Job, bookTitle: string | undefined): string {
  const kind = KIND_LABELS[job.kind] ?? job.kind;
  const ingest = isIngestKind(job.kind);
  const book = bookTitle ?? (ingest ? job.title : null);
  const detail = ingest ? null : job.title;
  return [kind, book, detail].filter((part): part is string => Boolean(part)).join(' · ');
}

/** 結束時間 HH:MM（本地時區）。 */
export function finishedTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const FINISH_GLYPH: Record<string, string> = { done: '✓', error: '✕', cancelled: '—' };

export function finishGlyph(status: string): string {
  return FINISH_GLYPH[status] ?? '';
}
