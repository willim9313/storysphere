import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
  booksWithHits,
  groupCap,
  MORE_LIMIT,
  mergeBookSearches,
  padPosition,
  parseSearchParams,
  PER_BOOK_LIMIT,
  queryTerms,
  replaceBookResults,
  splitHighlight,
  toSearchParams,
  type BookGroup,
  type SearchUrlState,
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
  expanded,
  moreState,
  onShowMore,
}: Readonly<{
  group: BookGroup;
  query: string;
  mode: SearchMode;
  onNavigateBook: (bookId: string) => void;
  onNavigatePassage: (bookId: string, result: SearchResult) => void;
  expanded: boolean;
  moreState: 'idle' | 'loading' | 'error';
  onShowMore: (bookId: string) => void;
}>) {
  const { t } = useTranslation('search');
  const [collapsed, setCollapsed] = useState(false);
  const scoreHeading = mode === 'fulltext' ? t('score.hits') : t('score.relevance');
  const cap = groupCap(group.results.length, expanded);

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
          {cap === 'more'
            ? t('group.countCapped', { count: group.results.length })
            : cap === 'max'
              ? t('group.countMax', { count: group.results.length })
              : `${group.results.length} ${t('tabs.paragraph')}`}
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
              data-result-id={result.id}
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
          {cap === 'more' && (
            <div className="srch-group-more">
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary"
                onClick={() => onShowMore(group.documentId)}
                disabled={moreState === 'loading'}
              >
                {moreState === 'loading' ? t('loading') : t('group.showMore')}
              </button>
              {moreState === 'error' && (
                <span className="srch-group-more-error" role="alert">
                  {t('group.showMoreFailed')}
                </span>
              )}
            </div>
          )}
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
  const location = useLocation();

  // The submitted search lives in the URL so 上一頁 from the reader and shared links restore it.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlKey = searchParams.toString();
  const urlState = useMemo(() => parseSearchParams(new URLSearchParams(urlKey)), [urlKey]);
  const { q: submittedQuery, mode } = urlState;

  const [query, setQuery] = useState(submittedQuery);
  // Back/forward between searches: the input follows the URL (adjust-during-render).
  const [inputUrlKey, setInputUrlKey] = useState(urlKey);
  if (inputUrlKey !== urlKey) {
    setInputUrlKey(urlKey);
    setQuery(submittedQuery);
  }
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<unknown>(null);
  const [failedBooks, setFailedBooks] = useState(0);
  // 「顯示更多」 per book: which books were re-fetched up to MORE_LIMIT, and in-flight/failed ones.
  const [expandedBooks, setExpandedBooks] = useState<ReadonlySet<string>>(new Set());
  const [moreStates, setMoreStates] = useState<Record<string, 'loading' | 'error'>>({});

  const searchGenRef = useRef(0);

  const { data: books, isLoading: booksLoading, error: booksError, refetch } = useBooks();

  const bookTitleMap = useMemo(
    () => Object.fromEntries((books ?? []).map((b) => [b.id, b.title])),
    [books],
  );

  const hasBooks = (books ?? []).length > 0;
  // Stable across refetches that return the same library, so they don't re-run the search.
  const libraryKey = books === undefined ? null : books.map((b) => b.id).join(',');
  // GET /books failed and there is nothing cached: we cannot claim the library is empty.
  const booksFailed = books === undefined && booksError !== null;

  // ── Search execution ─────────────────────────────────────────────────────────
  // Each library book is queried on its own (topK PER_BOOK_LIMIT), so every book with a hit
  // gets a group and a chip; chips then only filter locally.
  const runSearch = useCallback(async (q: string, searchMode: SearchMode, bookIds: string[]) => {
    if (!q.trim()) return;
    const gen = ++searchGenRef.current;
    setLoading(true);
    setSearchError(null);
    setFailedBooks(0);
    setExpandedBooks(new Set());
    setMoreStates({});

    try {
      const settled = await Promise.allSettled(
        bookIds.map((id) =>
          searchPassages({ query: q, bookId: id, topK: PER_BOOK_LIMIT, mode: searchMode }),
        ),
      );
      if (gen !== searchGenRef.current) return;
      const outcome = mergeBookSearches(bookIds, settled);
      // Every book failed → this is a failed search, not an incomplete one.
      if (bookIds.length > 0 && outcome.failedBookIds.length === bookIds.length) {
        throw outcome.firstError;
      }
      setResults(outcome.results);
      setFailedBooks(outcome.failedBookIds.length);
    } catch (err) {
      if (gen !== searchGenRef.current) return;
      console.error('[SearchPage] search failed', err);
      setSearchError(err ?? new Error('search failed'));
    } finally {
      if (gen === searchGenRef.current) setLoading(false);
    }
  }, []);

  // Query or mode change in the URL (submit, mode switch, back/forward) re-runs the search;
  // `books` only filters, so removing a chip does not.
  useEffect(() => {
    if (!submittedQuery) {
      searchGenRef.current += 1; // drop any in-flight response
      setResults(null);
      setSearchError(null);
      setFailedBooks(0);
      setLoading(false);
      return;
    }
    if (libraryKey === null) return; // book list not loaded yet
    void runSearch(submittedQuery, mode, libraryKey ? libraryKey.split(',') : []);
  }, [submittedQuery, mode, libraryKey, runSearch]);

  const rerun = useCallback(() => {
    if (libraryKey !== null) void runSearch(submittedQuery, mode, libraryKey ? libraryKey.split(',') : []);
  }, [submittedQuery, mode, libraryKey, runSearch]);

  // New query → new history entry; mode, chips and clear replace the current one.
  const commitSearch = useCallback(
    (next: SearchUrlState, replace: boolean) => {
      const nextKey = toSearchParams(next).toString();
      if (nextKey === urlKey) {
        // Same URL (re-submitting the same query): no navigation, so search directly.
        if (next.q) rerun();
        return;
      }
      setSearchParams(new URLSearchParams(nextKey), { replace });
    },
    [urlKey, setSearchParams, rerun],
  );

  // ── Derived scope ────────────────────────────────────────────────────────────
  // books=null → every book with a hit; books=[] → every chip removed; else the URL's chips.
  const scopeIds = useMemo(
    () => urlState.books ?? (results ? booksWithHits(results) : []),
    [urlState.books, results],
  );

  const handleSubmit = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.preventDefault();
      if (!query.trim()) return;
      commitSearch({ q: query, mode, books: null }, false);
    },
    [query, mode, commitSearch],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    commitSearch({ q: '', mode, books: null }, true);
  }, [mode, commitSearch]);

  const handleRemoveChip = useCallback(
    (bookId: string) => {
      commitSearch({ q: submittedQuery, mode, books: scopeIds.filter((id) => id !== bookId) }, true);
    },
    [scopeIds, submittedQuery, mode, commitSearch],
  );

  // 重試／重新搜尋: re-send the same query; the chips keep filtering.
  const handleRetry = rerun;

  const handleModeChange = useCallback(
    (newMode: SearchMode) => {
      if (newMode === mode) return;
      commitSearch({ q: submittedQuery, mode: newMode, books: null }, true);
    },
    [mode, submittedQuery, commitSearch],
  );

  const handleShowMore = useCallback(
    async (bookId: string) => {
      const gen = searchGenRef.current;
      setMoreStates((s) => ({ ...s, [bookId]: 'loading' }));
      try {
        const more = await searchPassages({ query: submittedQuery, bookId, topK: MORE_LIMIT, mode });
        if (gen !== searchGenRef.current) return;
        setResults((prev) => (prev ? replaceBookResults(prev, bookId, more) : prev));
        setExpandedBooks((prev) => new Set(prev).add(bookId));
        setMoreStates(({ [bookId]: _done, ...rest }) => rest);
      } catch (err) {
        if (gen !== searchGenRef.current) return;
        console.error('[SearchPage] show more failed', err);
        setMoreStates((s) => ({ ...s, [bookId]: 'error' }));
      }
    },
    [submittedQuery, mode],
  );

  // Before leaving for the reader, remember the clicked row on this history entry;
  // 上一頁 then scrolls back to it and focuses it instead of landing at the top.
  const handleNavigatePassage = useCallback(
    (bookId: string, result: SearchResult) => {
      navigate({ search: location.search }, { replace: true, state: { lastResultId: result.id } });
      navigate(`/books/${bookId}`, {
        state: {
          paragraphId: result.id,
          chapterNumber: result.metadata.chapterNumber,
          // Keyword hits are literal, so the reader marks them; a semantic query is a
          // description that rarely appears verbatim, so it would mark nothing.
          markTerms: mode === 'fulltext' ? queryTerms(submittedQuery) : undefined,
        },
      });
    },
    [navigate, location.search, mode, submittedQuery],
  );

  const lastResultId = (location.state as { lastResultId?: string } | null)?.lastResultId;
  const restoredKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lastResultId || loading || results === null) return;
    if (restoredKeyRef.current === location.key) return;
    const row = document.querySelector<HTMLElement>(`[data-result-id="${CSS.escape(lastResultId)}"]`);
    if (!row) return;
    restoredKeyRef.current = location.key;
    row.scrollIntoView({ block: 'center' });
    row.focus({ preventScroll: true });
  }, [lastResultId, loading, results, location.key]);

  // ── Derived groups ───────────────────────────────────────────────────────────
  const groups = useMemo<BookGroup[]>(
    () => (results ? groupResults(results, urlState.books, (id) => bookTitleMap[id]) : []),
    [results, urlState.books, bookTitleMap],
  );

  const totalCount = groups.reduce((s, g) => s + g.results.length, 0);

  // ── Content renderer ─────────────────────────────────────────────────────────
  const hasSearched = submittedQuery !== '';
  const showChips = scopeIds.length > 0;

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

    // Restored from the URL while the book list is still loading: nothing fetched yet.
    if (results === null) return <SkeletonLoader />;

    if (groups.length === 0) {
      return (
        <EmptyState
          weight="prerequisite"
          title={t('empty.noResults')}
          description={mode === 'fulltext' ? t('empty.noResultsHintFulltext') : t('empty.noResultsHint')}
          action={
            mode === 'fulltext' ? (
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary"
                onClick={() => handleModeChange('semantic')}
              >
                {t('empty.trySemantic')}
              </button>
            ) : undefined
          }
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
                i18nKey={mode === 'semantic' ? 'summarySemantic' : 'summary'}
                values={{ count: totalCount, books: groups.length }}
                components={{ strong: <strong /> }}
              />
            </span>
            <span className="srch-sort-label">
              {t('sortByRelevance')}
              <ChevronDown size={12} />
            </span>
          </div>

          {/* Semantic search always returns its closest passages; its scores cannot tell
              relevant from unrelated (2-SR-10), so say what the ranking means instead of a cutoff. */}
          {mode === 'semantic' && <p className="srch-semantic-note">{t('semanticNote')}</p>}

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
            {scopeIds.map((id) => (
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
              onNavigatePassage={handleNavigatePassage}
              expanded={expandedBooks.has(group.documentId)}
              moreState={moreStates[group.documentId] ?? 'idle'}
              onShowMore={(id) => void handleShowMore(id)}
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
              placeholder={t(`placeholder.${mode}`)}
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
