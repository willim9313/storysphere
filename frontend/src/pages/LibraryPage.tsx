import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader, BookOpen, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useBooks } from '@/hooks/useBooks';
import { fetchTasks, type TaskStatus } from '@/api/tasks';
import { failureKind, techDetailOf } from '@/api/failureKind';
import { BookCard } from '@/components/library/BookCard';
import { RecentBookCard } from '@/components/library/RecentBookCard';
import {
  FULL_DENSITY_AFTER,
  bookIdOf,
  filterBooks,
  ingestionTasks,
  libraryCounts,
  recentBooks,
  taskBookTitle,
  type LibraryFilter,
} from '@/components/library/libraryModel';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageFailure } from '@/components/ui/PageFailure';
import { qk } from '@/api/queryKeys';
import '@/styles/library.css';

const FILTERS: LibraryFilter[] = ['all', 'analyzed', 'ready', 'processing'];

/** In-flight ingestion task, drawn in the BookCard processing state. */
function ProcessingBookCard({ task }: Readonly<{ task: TaskStatus }>) {
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');
  return (
    <div className="ss-bookcard lib-card lib-card-processing">
      <div className="ss-bookcard-cover lib-cover">
        <Loader size={16} className="animate-spin lib-spin" />
      </div>
      <div className="ss-bookcard-title">{taskBookTitle(task) ?? t('processing.fallbackTitle')}</div>
      <span className="ss-badge ss-badge-warning">
        <span className="ss-badge-glyph" aria-hidden="true">…</span>
        {tc('status.processing')}
      </span>
      {task.stage && (
        <div className="ss-bookcard-meta">
          <span>
            {task.stage} · <span className="lib-mono">{task.progress}%</span>
          </span>
        </div>
      )}
      {/* Only draw a bar when the backend reports a percentage. */}
      {task.progress > 0 && (
        <div className="ss-progress">
          <div className="ss-progress-fill" style={{ width: `${task.progress}%` }} />
        </div>
      )}
      <Link to={`/upload#${task.taskId}`} className="lib-card-cta">
        {t('processing.viewProgress')} →
      </Link>
    </div>
  );
}

/** The site's only pipeline-blocking node gets its own band above the filters:
 *  BookOpen icon + accent border + 審閱章節 → change together (§6). */
function ReviewGate({ tasks }: Readonly<{ tasks: TaskStatus[] }>) {
  const { t } = useTranslation('library');
  return (
    <section className="lib-gate">
      <div className="lib-gate-head">
        <h2 className="lib-gate-heading">{t('processing.awaitingReview')}</h2>
        <span className="lib-gate-rule" />
      </div>
      {tasks.map((task) => (
        <div key={task.taskId} className="lib-gate-card">
          <div className="lib-gate-icon">
            <BookOpen size={20} />
          </div>
          <div className="lib-gate-main">
            <div className="lib-gate-title">{taskBookTitle(task) ?? t('processing.fallbackTitle')}</div>
            <div className="lib-gate-sub">{t('processing.awaitingReview')}</div>
          </div>
          <Link
            to={`/upload/review/${bookIdOf(task)}?taskId=${task.taskId}`}
            className="ss-btn ss-btn-md ss-btn-primary"
          >
            {t('processing.reviewChapters')} →
          </Link>
        </div>
      ))}
    </section>
  );
}

function LibrarySkeleton() {
  const { t: tc } = useTranslation('common');
  return (
    <div className="lib-page lib-page-full" aria-busy="true">
      <span className="sr-only" role="status">
        {tc('loading')}
      </span>
      <div className="lib-inner">
        <div className="lib-skel lib-skel-title" />
        <div className="lib-filters">
          {[56, 64, 64, 64].map((w, i) => (
            <div key={i} className="lib-skel lib-skel-chip" style={{ width: w }} />
          ))}
        </div>
        <div className="lib-grid">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="lib-skel-card">
              <div className="lib-skel lib-skel-cover" />
              <div className="lib-skel lib-skel-line" style={{ width: '70%' }} />
              <div className="lib-skel lib-skel-badge" />
              <div className="lib-skel lib-skel-line lib-skel-meta" style={{ width: '56%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const { setPageContext } = useChatDispatch();
  const queryClient = useQueryClient();
  const { data: books, isLoading, error, refetch } = useBooks();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');

  // Shares the app-level task poll (useTaskNotifications) — same key, same
  // cadence; no extra traffic.
  const { data: tasks } = useQuery<TaskStatus[]>({
    queryKey: qk.tasks.list(),
    queryFn: () => fetchTasks(),
    refetchInterval: (query) =>
      query.state.data?.some((x) => x.status !== 'done' && x.status !== 'error') ? 4000 : false,
  });
  const { processing, awaiting } = ingestionTasks(tasks);

  // A task leaving the in-flight set means its book just landed (or failed):
  // refresh the list so the card appears without a reload.
  const inFlightKey = [...processing, ...awaiting].map((x) => x.taskId).join(',');
  const inFlightRef = useRef<string[] | null>(null);
  useEffect(() => {
    const now = inFlightKey ? inFlightKey.split(',') : [];
    const prev = inFlightRef.current;
    inFlightRef.current = now;
    if (prev && prev.some((id) => !now.includes(id))) {
      void queryClient.invalidateQueries({ queryKey: qk.books });
    }
  }, [inFlightKey, queryClient]);

  useEffect(() => {
    setPageContext({ page: 'library' });
  }, [setPageContext]);

  if (isLoading) return <LibrarySkeleton />;

  const title = <h1 className="lib-title">{t('allBooks')}</h1>;

  if (error) {
    return (
      <div className="lib-page">
        <div className="lib-inner">
          <h1 className="lib-title lib-title-failure">{t('allBooks')}</h1>
          <PageFailure
            variant={failureKind(error)}
            pageName={t('allBooks')}
            onRetry={() => void refetch()}
            techDetail={techDetailOf(error)}
            secondaryAction={
              <Link to="/upload" className="ss-btn ss-btn-md ss-btn-secondary">
                {t('uploadNew')}
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const safeBooks = books ?? [];
  if (safeBooks.length === 0 && processing.length === 0 && awaiting.length === 0) {
    return (
      <div className="lib-page">
        <div className="lib-inner">
          <EmptyState
            weight="ready"
            icon={<BookOpen size={28} />}
            title={t('empty.title')}
            description={t('empty.description')}
            hand
            action={
              <Link to="/upload" className="ss-btn ss-btn-md ss-btn-primary">
                {t('uploadNew')}
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const full = safeBooks.length + processing.length > FULL_DENSITY_AFTER;
  const counts = libraryCounts(safeBooks);
  const summary = [
    t('summary.books', { count: counts.total }),
    ...(['analyzed', 'ready', 'error'] as const)
      .filter((k) => counts[k] > 0)
      .map((k) => `${counts[k]} ${tc(`status.${k}`)}`),
  ].join(' · ');
  const recent = recentBooks(safeBooks);
  const filtered = filterBooks(safeBooks, filter);
  const showTasks = filter === 'all' || filter === 'processing';

  let grid;
  if (filter === 'processing' && processing.length === 0) {
    grid = (
      <EmptyState
        weight="prerequisite"
        icon={<Upload size={26} />}
        title={t('empty.processingTitle')}
        description={t('empty.processingBody')}
        action={
          <Link to="/upload" className="ss-btn ss-btn-md ss-btn-secondary lib-btn-accent">
            {t('uploadNew')}
          </Link>
        }
      />
    );
  } else if (filter !== 'all' && filter !== 'processing' && filtered.length === 0) {
    grid = (
      <EmptyState
        weight="filtered"
        title={t('empty.filteredTitle', { status: tc(`status.${filter}`) })}
        action={
          <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={() => setFilter('all')}>
            {t('empty.clearFilter')}
          </button>
        }
      />
    );
  } else {
    grid = (
      <div className="lib-grid">
        {showTasks && processing.map((task) => <ProcessingBookCard key={task.taskId} task={task} />)}
        {filtered.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
        <Link to="/upload" className="ss-bookcard ss-bookcard-upload lib-card">
          <Plus size={20} />
          <span>{t('uploadNew')}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={full ? 'lib-page lib-page-full' : 'lib-page'}>
      <div className="lib-inner">
        <div className="lib-head">
          {title}
          <span className="lib-summary">{summary}</span>
        </div>

        {awaiting.length > 0 && <ReviewGate tasks={awaiting} />}

        {recent.length > 0 && (
          <section className="lib-recent">
            <h2 className="lib-section-head">{t('recentlyOpened')}</h2>
            <div className="lib-recent-row">
              {recent.map((book) => (
                <RecentBookCard key={book.id} book={book} />
              ))}
            </div>
          </section>
        )}

        <div className="lib-filters" role="group" aria-label={t('filters.label')}>
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              className={filter === key ? 'lib-chip active' : 'lib-chip'}
              onClick={() => setFilter(key)}
            >
              {t(`filters.${key}`)}
            </button>
          ))}
        </div>

        {grid}
      </div>
    </div>
  );
}
