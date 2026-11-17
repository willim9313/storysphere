import { useRef, useState } from 'react';
import { LoaderCircle, Upload } from 'lucide-react';
import { useBooks, useUploadBook, type Book } from '@/api/books';
import { ApiError } from '@/api/client';
import { RESUMABLE, TERMINAL, useJobs, type Job } from '@/api/jobs';
import { BookCard, UploadJobCard } from '@/components/library/BookCard';
import { BookEvents, JobEvents } from '@/components/library/LiveUpdates';
import { UploadTile } from '@/components/library/UploadTile';
import { ACTIVE_INGEST, UPLOAD_ACCEPT } from '@/components/library/labels';
import { PageHeader, PageMain } from '@/components/layout/PageMain';

/** 「4 本 · 1 本入庫中 · 1 本暫停 · 1 本等待章節審閱」；為 0 的項目不列。 */
function summarize(books: Book[]): string {
  const count = (pred: (s: string) => boolean) =>
    books.filter((b) => b.ingestStatus !== null && pred(b.ingestStatus)).length;
  const parts = [`${books.length} 本`];
  const active = count((s) => ACTIVE_INGEST.has(s));
  const paused = count((s) => RESUMABLE.has(s));
  const review = count((s) => s === 'awaiting_review');
  const failed = count((s) => s === 'error');
  if (active) parts.push(`${active} 本入庫中`);
  if (paused) parts.push(`${paused} 本暫停`);
  if (review) parts.push(`${review} 本等待章節審閱`);
  if (failed) parts.push(`${failed} 本失敗`);
  return parts.join(' · ');
}

interface UploadMessage {
  file: string;
  text: string;
  isError: boolean;
}

/** 畫面 1 書庫（畫布 `Library.dc.html`）。 */
export function LibraryPage() {
  const books = useBooks();
  const jobs = useJobs();
  const upload = useUploadBook();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<UploadMessage[]>([]);

  const jobById = new Map((jobs.data ?? []).map((j) => [j.id, j]));
  // P1 寫入 books 之前，剛上傳的檔案只看得到 job。
  const uploadJobs: Job[] = (jobs.data ?? []).filter(
    (j) =>
      j.kind === 'ingest' && j.bookId === null && (!TERMINAL.has(j.status) || j.status === 'error'),
  );
  const liveBooks = (books.data ?? []).filter(
    (b) => b.ingestStatus !== null && !TERMINAL.has(b.ingestStatus),
  );

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setMessages([]);
    const next: UploadMessage[] = [];
    for (const file of files) {
      try {
        const res = await upload.mutateAsync(file);
        if (res.duplicateTitle) {
          next.push({ file: file.name, text: '書庫已有同名的書，仍會另外入庫。', isError: false });
        }
      } catch (err) {
        next.push({
          file: file.name,
          text: err instanceof ApiError ? err.detail : '上傳失敗',
          isError: true,
        });
      }
    }
    setMessages(next);
    setUploading(false);
  }

  const pick = () => inputRef.current?.click();
  const isEmpty = books.isSuccess && books.data.length === 0 && uploadJobs.length === 0;

  return (
    <PageMain>
      {liveBooks.map((b) => (
        <BookEvents key={b.id} bookId={b.id} />
      ))}
      {uploadJobs
        .filter((j) => !TERMINAL.has(j.status))
        .map((j) => (
          <JobEvents key={j.id} jobId={j.id} />
        ))}

      <PageHeader
        title="書庫"
        meta={books.data ? summarize(books.data) : undefined}
        actions={
          <button
            type="button"
            className="ss-btn ss-btn-md ss-btn-primary"
            disabled={uploading}
            onClick={pick}
          >
            <Upload size={14} aria-hidden />
            <span>上傳</span>
          </button>
        }
      />
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void uploadFiles(files);
        }}
      />

      {messages.length > 0 && (
        <ul
          role="status"
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          {messages.map((m, i) => (
            <li key={i} style={{ color: m.isError ? 'var(--color-error)' : 'var(--fg-secondary)' }}>
              {m.file}：{m.text}
            </li>
          ))}
        </ul>
      )}

      {books.isPending && (
        <span className="ss-loader" style={{ color: 'var(--fg-muted)' }} aria-label="載入中">
          <LoaderCircle size={22} aria-hidden />
        </span>
      )}

      {books.isError && (
        <p role="alert" style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>
          {books.error instanceof ApiError && books.error.hasBody
            ? `讀不到書庫：${books.error.detail}`
            : '連不上後端，請確認伺服器已啟動。'}
        </p>
      )}

      {isEmpty && (
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--fg-secondary)' }}>
          書庫還沒有書。上傳一本小說開始入庫。
        </p>
      )}

      {books.isSuccess && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--space-6)',
          }}
        >
          {uploadJobs.map((j) => (
            <UploadJobCard key={j.id} job={j} />
          ))}
          {books.data.map((b) => (
            <BookCard key={b.id} book={b} job={b.ingestJobId ? jobById.get(b.ingestJobId) : undefined} />
          ))}
          <UploadTile onPick={pick} onDrop={(files) => void uploadFiles(files)} disabled={uploading} />
        </div>
      )}

      <p style={{ margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
        上傳後依設定頁的模型配置入庫，會消耗 token。全書只讀一次；題材判定後的預設分析會自動接著跑。
      </p>
    </PageMain>
  );
}
