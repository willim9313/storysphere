import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FileText, LoaderCircle, Pause } from 'lucide-react';
import type { Book } from '@/api/books';
import { ApiError } from '@/api/client';
import { RESUMABLE, useResumeJob, type Job } from '@/api/jobs';
import { ACTIVE_INGEST, genreLabel, stageLabel } from './labels';

const note: CSSProperties = {
  margin: 0,
  fontSize: 'var(--font-size-2xs)',
  color: 'var(--fg-secondary)',
  lineHeight: 1.5,
};
const badgeRow: CSSProperties = { display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' };
const linkReset: CSSProperties = { textDecoration: 'none' };

function Cover({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="ss-bookcard-cover">{children}</div>;
}

const fileCover = (
  <Cover>
    <FileText size={28} color="var(--accent)" aria-hidden />
  </Cover>
);

function CardHead({ title, author }: Readonly<{ title: string; author?: string | null }>) {
  return (
    <>
      <div className="ss-bookcard-title">{title}</div>
      {author && <div className="ss-bookcard-author">{author}</div>}
    </>
  );
}

function Progress({ job }: Readonly<{ job: Job | undefined }>) {
  const progress = Math.max(0, Math.min(100, Math.round(job?.progress ?? 0)));
  const stage = stageLabel(job?.stage);
  return (
    <>
      <div className="ss-bookcard-meta">
        <span>{stage ? `${stage} · ${progress}%` : `${progress}%`}</span>
      </div>
      <div
        className="ss-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="ss-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </>
  );
}

function ResumeButton({ jobId, bookId }: Readonly<{ jobId: string; bookId: string }>) {
  const resume = useResumeJob();
  return (
    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div>
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
          disabled={resume.isPending}
          onClick={() => resume.mutate({ id: jobId, bookId })}
        >
          續跑
        </button>
      </div>
      {resume.error && (
        <p role="alert" style={{ ...note, color: 'var(--color-error)' }}>
          {resume.error instanceof ApiError ? resume.error.detail : '續跑失敗'}
        </p>
      )}
    </div>
  );
}

/** 一本書的卡片；狀態取自 `book.ingestStatus`（04 §3.2），進度取自對應的 job。 */
export function BookCard({ book, job }: Readonly<{ book: Book; job: Job | undefined }>) {
  const status = book.ingestStatus;
  const bookPath = `/books/${encodeURIComponent(book.id)}`;
  const ingestPath = `${bookPath}/ingest`;
  const head = <CardHead title={book.title} author={book.author} />;

  if (status !== null && ACTIVE_INGEST.has(status)) {
    return (
      <Link className="ss-bookcard" to={ingestPath}>
        <Cover>
          <span className="ss-loader" style={{ color: 'var(--fg-muted)' }}>
            <LoaderCircle size={22} aria-hidden />
          </span>
        </Cover>
        {head}
        <div style={badgeRow}>
          <span className="ss-badge ss-badge-warning">入庫中</span>
        </div>
        <Progress job={job} />
      </Link>
    );
  }

  if (status !== null && RESUMABLE.has(status) && book.ingestJobId) {
    const stage = stageLabel(job?.stage);
    const done = job ? `${stage ? `${stage} ` : ''}已完成 ${Math.round(job.progress)}%；` : '';
    return (
      <div className="ss-bookcard" style={{ cursor: 'default' }}>
        <Cover>
          <Pause size={26} color="var(--fg-muted)" aria-hidden />
        </Cover>
        {head}
        <div style={badgeRow}>
          <span className="ss-badge ss-badge-warning">
            {status === 'paused_quota' ? '暫停：額度用完' : '已中斷'}
          </span>
        </div>
        <p style={note}>{done}已完成的不必重跑。</p>
        <ResumeButton jobId={book.ingestJobId} bookId={book.id} />
      </div>
    );
  }

  if (status === 'awaiting_review') {
    return (
      <div className="ss-bookcard" style={{ cursor: 'default' }}>
        {fileCover}
        {head}
        <div style={badgeRow}>
          <span className="ss-badge ss-badge-info">等待章節審閱</span>
        </div>
        <p style={note}>文件處理完成，偵測到 {book.chapterCount} 章。審閱後才開始抽取。</p>
        <div style={{ marginTop: 'auto' }}>
          <Link className="ss-btn ss-btn-sm ss-btn-secondary" style={linkReset} to={ingestPath}>
            前往審閱
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'error' || status === 'cancelled') {
    return (
      <div className="ss-bookcard" style={{ cursor: 'default' }}>
        <Cover>
          <AlertTriangle size={26} color="var(--fg-muted)" aria-hidden />
        </Cover>
        {head}
        <div style={badgeRow}>
          {status === 'error' ? (
            <span className="ss-badge ss-badge-error">失敗</span>
          ) : (
            <span className="ss-badge ss-badge-neutral">
              已取消
            </span>
          )}
        </div>
        {job?.error && <p style={note}>{job.error}</p>}
        <div style={{ marginTop: 'auto' }}>
          <Link className="ss-btn ss-btn-sm ss-btn-secondary" style={linkReset} to={ingestPath}>
            查看入庫
          </Link>
        </div>
      </div>
    );
  }

  // done（或沒有入庫 job 的書）→ 書籍總覽。
  return (
    <Link className="ss-bookcard" to={bookPath}>
      {fileCover}
      {head}
      <div style={badgeRow}>
        {status === 'done' && <span className="ss-badge ss-badge-success">已入庫</span>}
        {book.effectiveGenre && (
          <span className="ss-badge ss-badge-neutral">
            {genreLabel(book.effectiveGenre)}
          </span>
        )}
      </div>
      <div className="ss-bookcard-meta">
        <span>{book.chapterCount} 章</span>
      </div>
    </Link>
  );
}

/** 剛上傳、P1 還沒寫入 books 的 ingest job（沒有 bookId，也還不能點）。 */
export function UploadJobCard({ job }: Readonly<{ job: Job }>) {
  const failed = job.status === 'error';
  return (
    <div className="ss-bookcard" style={{ cursor: 'default' }}>
      <Cover>
        {failed ? (
          <AlertTriangle size={26} color="var(--fg-muted)" aria-hidden />
        ) : (
          <span className="ss-loader" style={{ color: 'var(--fg-muted)' }}>
            <LoaderCircle size={22} aria-hidden />
          </span>
        )}
      </Cover>
      <CardHead title={job.title ?? '上傳的檔案'} />
      <div style={badgeRow}>
        {failed ? (
          <span className="ss-badge ss-badge-error">失敗</span>
        ) : (
          <span className="ss-badge ss-badge-warning">入庫中</span>
        )}
      </div>
      {failed ? job.error && <p style={note}>{job.error}</p> : <Progress job={job} />}
    </div>
  );
}
