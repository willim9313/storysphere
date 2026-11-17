import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { apiFetch } from '@/api/client';
import type { Book } from '@/api/books';
import { TERMINAL, useJobs } from '@/api/jobs';
import { queryKeys } from '@/api/queryKeys';
import { JobCard } from '@/components/jobs/JobCard';
import { RecentJobs } from '@/components/jobs/RecentJobs';

const groupLabelStyle = {
  fontSize: 'var(--font-size-2xs)',
  color: 'var(--fg-muted)',
  letterSpacing: '0.06em',
} as const;

/** 工作中心（側欄抽屜，畫布 `Jobs.dc.html`）。沒有全域 job 串流，開著時每 2 秒輪詢 N-09a。 */
export function JobsDrawer({ onClose }: Readonly<{ onClose: () => void }>) {
  const ref = useRef<HTMLElement>(null);
  const jobs = useJobs({ refetchInterval: 2000 });
  // 卡片標題要書名；job 只帶 bookId。
  const books = useQuery({ queryKey: queryKeys.books, queryFn: () => apiFetch<Book[]>('/books') });

  // 打開時把焦點移進抽屜，Esc 才關得掉（只在焦點在抽屜內時生效）。
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const bookTitles = useMemo(
    () => new Map((books.data ?? []).map((b) => [b.id, b.title])),
    [books.data],
  );
  const active = (jobs.data ?? []).filter((j) => !TERMINAL.has(j.status));
  const recent = (jobs.data ?? [])
    .filter((j) => TERMINAL.has(j.status))
    .sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-labelledby="jobs-h"
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 400,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        borderLeft: 'var(--card-border-width) var(--border-style) var(--border)',
        boxShadow: 'var(--shadow-lg)',
        outline: 'none',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-5) var(--space-6)',
          borderBottom: 'var(--border-width) var(--border-style) var(--border)',
        }}
      >
        <h2
          id="jobs-h"
          style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-base)', fontWeight: 700 }}
        >
          工作中心
        </h2>
        <button
          type="button"
          aria-label="關閉"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 'var(--space-2)' }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div
        style={{
          padding: 'var(--space-5) var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          overflow: 'auto',
        }}
      >
        {jobs.isPending && <span style={{ ...groupLabelStyle, fontSize: 'var(--font-size-xs)' }}>載入中…</span>}
        {jobs.isError && !jobs.data && (
          <span role="alert" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>
            讀不到工作清單，請確認後端已啟動。
          </span>
        )}
        {jobs.data && (
          <>
            {active.length > 0 ? (
              <>
                <span style={groupLabelStyle}>進行中 · {active.length}</span>
                {active.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    bookTitle={job.bookId ? bookTitles.get(job.bookId) : undefined}
                    onNavigate={onClose}
                  />
                ))}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-6) 0' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  目前沒有進行中的工作
                </span>
                <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                  入庫、分析與測試開始後會出現在這裡。
                </span>
              </div>
            )}
            {recent.length > 0 && (
              <>
                <span style={{ ...groupLabelStyle, marginTop: 'var(--space-4)' }}>最近完成</span>
                <RecentJobs jobs={recent} bookTitles={bookTitles} />
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
