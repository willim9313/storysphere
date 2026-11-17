import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { RESUMABLE, TERMINAL, useCancelJob, useResumeJob, type Job } from '@/api/jobs';
import { isIngestKind, jobTitle, stageLabel, statusInfo } from './jobLabels';

const cardStyle: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};
const subStyle: CSSProperties = {
  fontSize: 'var(--font-size-2xs)',
  color: 'var(--fg-secondary)',
  lineHeight: 1.5,
};

function subline(job: Job): string | null {
  const stage = stageLabel(job);
  switch (job.status) {
    case 'running':
      return [stage, `${Math.round(job.progress)}%`].filter(Boolean).join(' · ');
    case 'pending':
      return stage;
    case 'paused_quota':
      return [stage, '不算失敗，可稍後續跑；續跑時只跑沒完成的單位。'].filter(Boolean).join(' · ');
    case 'interrupted':
      return '伺服器重啟時中斷。按續跑才會繼續，已完成的單位不重跑。';
    default:
      return null;
  }
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.detail : '操作失敗，請稍後再試。';
}

/** 「進行中」的一張 job 卡（畫布 `Jobs.dc.html`）。 */
export function JobCard({
  job,
  bookTitle,
  onNavigate,
}: Readonly<{ job: Job; bookTitle: string | undefined; onNavigate: () => void }>) {
  const cancel = useCancelJob();
  const resume = useResumeJob();
  const { label, tone } = statusInfo(job.status);
  const sub = subline(job);
  const busy = cancel.isPending || resume.isPending;

  const awaitingReview = job.status === 'awaiting_review' && job.bookId;
  let viewHref: string | null = null;
  if (job.bookId) {
    viewHref = isIngestKind(job.kind)
      ? `/books/${encodeURIComponent(job.bookId)}/ingest`
      : `/books/${encodeURIComponent(job.bookId)}`;
  }
  const failure = job.errorKind || job.error;
  const mutationError = cancel.error ?? resume.error;

  return (
    <article style={cardStyle} aria-label={jobTitle(job, bookTitle)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
          {jobTitle(job, bookTitle)}
        </span>
        <span
          className={`ss-badge ss-badge-${tone ?? 'neutral'}`}
          style={{ flexShrink: 0 }}
        >
          {label}
        </span>
      </div>
      {sub && <span style={subStyle}>{sub}</span>}
      {job.status === 'running' && (
        <div
          className="ss-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(job.progress)}
        >
          <div className="ss-progress-fill" style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }} />
        </div>
      )}
      {failure && (
        <span style={{ ...subStyle, color: 'var(--color-error)' }}>
          {[job.errorKind, job.error].filter(Boolean).join('：')}
        </span>
      )}
      {mutationError && (
        <span role="alert" style={{ ...subStyle, color: 'var(--color-error)' }}>
          {errorText(mutationError)}
        </span>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {awaitingReview ? (
          <Link className="ss-btn ss-btn-sm ss-btn-secondary" to={viewHref ?? '/'} onClick={onNavigate}>
            前往審閱
          </Link>
        ) : (
          viewHref && (
            <Link className="ss-btn ss-btn-sm ss-btn-ghost" to={viewHref} onClick={onNavigate}>
              查看
            </Link>
          )
        )}
        {RESUMABLE.has(job.status) && (
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
            disabled={busy}
            onClick={() => resume.mutate(job)}
          >
            續跑
          </button>
        )}
        {!TERMINAL.has(job.status) && (
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-danger"
            disabled={busy}
            onClick={() => cancel.mutate(job)}
          >
            終止
          </button>
        )}
      </div>
    </article>
  );
}
