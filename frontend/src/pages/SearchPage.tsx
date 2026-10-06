import { useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Search, ChevronDown, ArrowUpRight, X, Upload, AlertTriangle } from 'lucide-react';

import { useBooks } from '@/hooks/useBooks';
import { searchPassages, type SearchMode, type SearchResult } from '@/api/search';
import { failureKind, techDetailOf } from '@/api/failureKind';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageFailure } from '@/components/ui/PageFailure';
import {
  formatScore,
  groupResults,
  hitOffsets,
  mergeBookSearches,
  padPosition,
  splitHighlight,
  type BookGroup,
} from '@/pages/search/searchModel';

import '@/styles/search.css';

// ── Sub-components ─────────────────────────────────────────────────────────────
function SkeletonLoader() {
  return (
    <div className="srch-skeleton" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <div key={n} className="srch-skel-group">
          <div className="srch-skel-title" />
          {[1, 2].map((r) => (
            <div key={r} className="srch-skel-row">
              <div className="srch-skel-bar srch-skel-pos" />
              <div className="srch-skel-lines">
                <div className="srch-skel-bar srch-skel-line" />
                <div className="srch-skel-bar srch-skel-line srch-skel-line-short" />
              </div>
              <div className="srch-skel-bar srch-skel-score" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Paragraph text in full (never clamped), keyword hits as <mark>, plus the 3px hit track. */
function ResultBody({
  text,
  query,
  mode,
}: Readonly<{ text: string; query: string; mode: SearchMode }>) {
  const segments = splitHighlight(text, query);
  const offsets = mode === 'fulltext' ? hitOffsets(text, query) : [];

  return (
    <div className="srch-row-body">
      {offsets.length > 0 && (
        <span className="srch-track" aria-hidden="true">
          {offsets.map((frac) => (
            <span
              key={frac}
              className="srch-track-tick"
              style={{ top: `calc(${(frac * 100).toFixed(2)}% - var(--space-1))` }}
            />
          ))}
        </span>
      )}
      <p className="srch-row-text">
        {segments.map((seg, i) =>
          seg.hit ? (
            <mark key={i} className="srch-mark">
              {seg.text}
            </mark>
          ) : (
            seg.text
          ),
        )}
      </p>
    </div>
  );
}

function BookGroupSection({
  group,
  query,
  mode,
  onNavigateBook,
  onNavigatePassage,
}: Readonly<{
  group: BookGroup;
  query: string;
  mode: SearchMode;
  onNavigateBook: (bookId: string) => void;
  onNavigatePassage: (bookId: string, result: SearchResult) => void;
}>) {
  const { t } = useTranslation('search');
  const [collapsed, setCollapsed] = useState(false);
  const scoreHeading = mode === 'fulltext' ? t('score.hits') : t('score.relevance');

  return (
    <div className="srch-group">
      <div className="srch-group-header">
        <button
          type="button"
          className={`srch-group-toggle${collapsed ? ' collapsed' : ''}`}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? t('aria.expand') : t('aria.collapse')}
          aria-expanded={!collapsed}
        >
          <ChevronDown size={14} />
        </button>

        <h2 className="srch-group-title">{group.title}</h2>

        <span className="srch-group-count">
          {group.results.length} {t('tabs.paragraph')}
        </span>

        <span className="srch-group-rule" />

        <button
          type="button"
          className="srch-group-goto"
          onClick={() => onNavigateBook(group.documentId)}
        >
          {t('result.goToBook')}
          <ArrowUpRight size={12} />
        </button>
      </div>

      {!collapsed && (
        <div className="srch-rows">
          {group.results.map((result) => (
            <button
              key={result.id}
              type="button"
              className="srch-row"
              onClick={() => onNavigatePassage(group.documentId, result)}
            >
              <code className="srch-row-pos">
                {t('result.locator', {
                  chapter: result.metadata.chapterNumber,
                  position: padPosition(result.metadata.position),
                })}
              </code>
              <ResultBody text={result.text} query={query} mode={mode} />
              <span className="srch-row-score">
                <span className="srch-row-score-label">{scoreHeading}</span>
                <span className="srch-row-score-value">{formatScore(result.score, mode, (count) => t('score.hitCount', { count }))}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const { t } = useTranslation('search');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [activeBookIds, setActiveBookIds] = useState<string[] | null>(null);
  const [mode, setMode] = useState<SearchMode>('fulltext');
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<unknown>(null);
  const [failedBooks, setFailedBooks] = useState(0);

  const chipsSeededRef = useRef(false);
  const searchGenRef = useRef(0);

  const { data: books, isLoading: booksLoading, error: booksError, refetch } = useBooks();

  const bookTitleMap = useMemo(
    () => Object.fromEntries((books ?? []).map((b) => [b.id, b.title])),
    [books],
  );

  const hasBooks = (books ?? []).length > 0;
  // GET /books failed and there is nothing cached: we cannot claim the library is empty.
  const booksFailed = books === undefined && booksError !== null;

  // ── Search execution ─────────────────────────────────────────────────────────
  const runSearch = useCallback(
    async (q: string, filterBookIds: string[] | null, searchMode: SearchMode) => {
      if (!q.trim()) return;
      const gen = ++searchGenRef.current;
      setLoading(true);
      setSearchError(null);
      setFailedBooks(0);

      try {
        let merged: SearchResult[];
        let failed = 0;

        if (filterBookIds === null || filterBookIds.length === 0) {
          merged = await searchPassages({ query: q, topK: 20, mode: searchMode });
          if (gen !== searchGenRef.current) return;

          if (!chipsSeededRef.current) {
            chipsSeededRef.current = true;
            setActiveBookIds([...new Set(merged.map((r) => r.metadata.documentId))]);
          }
        } else {
          const settled = await Promise.allSettled(
            filterBookIds.map((id) =>
              searchPassages({ query: q, bookId: id, topK: 10, mode: searchMode }),
            ),
          );
          if (gen !== searchGenRef.current) return;
          const outcome = mergeBookSearches(filterBookIds, settled);
          // Every book failed → this is a failed search, not an incomplete one.
          if (outcome.failedBookIds.length === filterBookIds.length) throw outcome.firstError;
          merged = outcome.results;
          failed = outcome.failedBookIds.length;
        }

        setResults(merged);
        setFailedBooks(failed);
      } catch (err) {
        if (gen !== searchGenRef.current) return;
        console.error('[SearchPage] search failed', err);
        setSearchError(err ?? new Error('search failed'));
      } finally {
        if (gen === searchGenRef.current) setLoading(false);
      }
    },
    [],
  );

  const handleSubmit = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.preventDefault();
      if (!query.trim()) return;
      chipsSeededRef.current = false;
      setSubmittedQuery(query);
      setActiveBookIds(null);
      void runSearch(query, null, mode);
    },
    [query, mode, runSearch],
  );

  const handleClear = useCallback(() => {
    searchGenRef.current += 1; // drop any in-flight response
    setQuery('');
    setSubmittedQuery('');
    setResults(null);
    setActiveBookIds(null);
    setSearchError(null);
    setFailedBooks(0);
    setLoading(false);
    chipsSeededRef.current = false;
  }, []);

  const handleRemoveChip = useCallback(
    (bookId: string) => {
      const next = (activeBookIds ?? []).filter((id) => id !== bookId);
      setActiveBookIds(next);
      void runSearch(submittedQuery, next.length > 0 ? next : null, mode);
    },
    [activeBookIds, submittedQuery, mode, runSearch],
  );

  // 重試／重新搜尋: re-send the same query against the current scope.
  const handleRetry = useCallback(() => {
    const scope = activeBookIds !== null && activeBookIds.length > 0 ? activeBookIds : null;
    void runSearch(submittedQuery, scope, mode);
  }, [activeBookIds, submittedQuery, mode, runSearch]);

  const handleModeChange = useCallback(
    (newMode: SearchMode) => {
      if (newMode === mode) return;
      setMode(newMode);
      if (submittedQuery) {
        chipsSeededRef.current = false;
        setActiveBookIds(null);
        void runSearch(submittedQuery, null, newMode);
      }
    },
    [mode, submittedQuery, runSearch],
  );

  // ── Derived groups ───────────────────────────────────────────────────────────
  const groups = useMemo<BookGroup[]>(
    () => (results ? groupResults(results, activeBookIds, (id) => bookTitleMap[id]) : []),
    [results, activeBookIds, bookTitleMap],
  );

  const totalCount = groups.reduce((s, g) => s + g.results.length, 0);

  // ── Content renderer ─────────────────────────────────────────────────────────
  const hasSearched = submittedQuery !== '';
  const showChips = activeBookIds !== null && activeBookIds.length > 0;

  function renderContent() {
    if (!hasSearched) {
      // Never show the initial prompt until the book list has actually answered.
      // (Empty library is handled before the search bar renders, see below.)
      if (booksLoading) return null;
      return (
        <div className="srch-initial">
          <div className="srch-initial-icon">
            <Search size={24} strokeWidth={1.7} />
          </div>
          <h1 className="srch-initial-title">{t('title')}</h1>
          <p className="srch-initial-sub">{t('subtitle')}</p>
        </div>
      );
    }

    if (loading) return <SkeletonLoader />;

    if (searchError !== null) {
      if (failureKind(searchError) === 'backend') {
        return (
          <PageFailure
            variant="backend"
            pageName={t('title')}
            onRetry={handleRetry}
            techDetail={techDetailOf(searchError)}
          />
        );
      }
      return (
        <div className="ss-state ss-state-stage" role="alert">
          <h4 className="ss-state-title">{t('error.searchFailed')}</h4>
          <div className="ss-state-actions">
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-primary"
              onClick={handleRetry}
            >
              {tc('retry')}
            </button>
          </div>
        </div>
      );
    }

    if (groups.length === 0) {
      return (
        <EmptyState
          weight="prerequisite"
          title={t('empty.noResults')}
          description={t('empty.noResultsHint')}
        />
      );
    }

    return (
      <>
        <div className="srch-summary">
          <div className="srch-summary-row">
            <span>
              <Trans
                t={t}
                i18nKey="summary"
                values={{ count: totalCount, books: groups.length }}
                components={{ strong: <strong /> }}
              />
            </span>
            <span className="srch-sort-label">
              {t('sortByRelevance')}
              <ChevronDown size={12} />
            </span>
          </div>

          {failedBooks > 0 && (
            <div className="srch-partial" role="status">
              <AlertTriangle size={14} className="srch-partial-icon" />
              <span className="srch-partial-text">{t('partial.message', { count: failedBooks })}</span>
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary"
                onClick={handleRetry}
              >
                {t('partial.retry')}
              </button>
            </div>
          )}
        </div>

        {showChips && (
          <div className="srch-chips">
            <span className="srch-chips-label">{t('scopeLabel')}</span>
            {activeBookIds.map((id) => (
              <span key={id} className="srch-chip">
                {bookTitleMap[id] ?? id}
                <button
                  type="button"
                  className="srch-chip-remove"
                  onClick={() => handleRemoveChip(id)}
                  aria-label={t('aria.removeBook', { title: bookTitleMap[id] ?? id })}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="srch-groups">
          {groups.map((group) => (
            <BookGroupSection
              key={group.documentId}
              group={group}
              query={submittedQuery}
              mode={mode}
              onNavigateBook={(id) => navigate(`/books/${id}`)}
              onNavigatePassage={(id, result) =>
                navigate(`/books/${id}`, {
                  state: {
                    paragraphId: result.id,
                    chapterNumber: result.metadata.chapterNumber,
                  },
                })
              }
            />
          ))}
        </div>
      </>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (booksFailed) {
    return (
      <div className="srch-scroll">
        <div className="srch-page">
          <PageFailure
            variant={failureKind(booksError)}
            pageName={t('title')}
            onRetry={() => void refetch()}
            techDetail={techDetailOf(booksError)}
          />
        </div>
      </div>
    );
  }

  // 書庫為空（05 稿 A 區右格）：沒有搜尋列、模式切換與分頁，只有 ready 分量的空狀態。
  if (!booksLoading && !hasBooks) {
    return (
      <div className="srch-scroll">
        <div className="srch-page">
          <EmptyState
            weight="ready"
            icon={<Upload size={28} />}
            title={t('empty.noBooks')}
            description={t('empty.noBooksHint')}
            action={
              <button
                type="button"
                className="ss-btn ss-btn-md ss-btn-primary"
                onClick={() => navigate('/upload')}
              >
                {t('empty.uploadNow')}
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="srch-scroll">
      <div className="srch-page">
        <form className="srch-bar" onSubmit={handleSubmit}>
          <div className="srch-field">
            <span className="srch-field-icon">
              <Search size={16} />
            </span>
            <input
              className="srch-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('placeholder')}
              autoFocus
              autoComplete="off"
            />
            {hasSearched && (
              <button
                type="button"
                className="srch-clear-btn"
                onClick={handleClear}
                aria-label={t('aria.clear')}
              >
                <X size={14} />
              </button>
            )}
            <span className="srch-scope">
              {t('scopeAll')}
              <ChevronDown size={12} />
            </span>
          </div>

          <div className="ss-seg" role="group" aria-label={t('aria.mode')}>
            <button
              type="button"
              className={`ss-seg-item${mode === 'fulltext' ? ' active' : ''}`}
              aria-pressed={mode === 'fulltext'}
              onClick={() => handleModeChange('fulltext')}
            >
              {t('mode.fulltext')}
            </button>
            <button
              type="button"
              className={`ss-seg-item${mode === 'semantic' ? ' active' : ''}`}
              aria-pressed={mode === 'semantic'}
              onClick={() => handleModeChange('semantic')}
            >
              {t('mode.semantic')}
            </button>
          </div>

          <button
            type="submit"
            className="ss-btn ss-btn-md ss-btn-primary srch-submit"
            disabled={loading || !query.trim()}
          >
            <Search size={14} />
            {t('submit')}
          </button>
        </form>

        {/* Tabs stay in every state. 人物／原型 are non-interactive placeholders. */}
        <div className="srch-tabs">
          <div className="srch-tab active">
            {t('tabs.paragraph')}
            {hasSearched && results !== null && (
              <span className="srch-tab-count">{totalCount}</span>
            )}
          </div>
          <div className="srch-tab srch-tab-soon">
            {t('tabs.character')}
            <span className="srch-tab-soon-badge">{t('comingSoon')}</span>
          </div>
          <div className="srch-tab srch-tab-soon">
            {t('tabs.archetype')}
            <span className="srch-tab-soon-badge">{t('comingSoon')}</span>
          </div>
        </div>

        {renderContent()}
      </div>
    </div>
  );
}
