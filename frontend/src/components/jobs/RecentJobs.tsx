import type { Job } from '@/api/jobs';
import { finishedTime, finishGlyph, jobTitle } from './jobLabels';

/** 「最近完成」清單：終態 job，右側 ✓／✕／— 加結束時間。 */
export function RecentJobs({
  jobs,
  bookTitles,
}: Readonly<{ jobs: Job[]; bookTitles: Map<string, string> }>) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {jobs.map((job) => (
        <li
          key={job.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) 0',
            borderTop: 'var(--border-width) var(--border-style) var(--border)',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          <span>{jobTitle(job, job.bookId ? bookTitles.get(job.bookId) : undefined)}</span>
          <span
            style={{
              flexShrink: 0,
              color: job.status === 'error' ? 'var(--color-error)' : 'var(--fg-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {finishGlyph(job.status)} {finishedTime(job.finishedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
