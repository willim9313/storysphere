import { useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, ArrowUpRight, X, Upload } from 'lucide-react';

import { useBooks } from '@/hooks/useBooks';
import { searchPassages, type SearchResult } from '@/api/search';

import '@/styles/search.css';

// ── Keyword highlight ──────────────────────────────────────────────────────────
function highlightText(text: string, query: string): React.ReactNode {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));

  if (words.length === 0) return text;

  // Capturing-group split: odd-indexed parts are always the matched text,
  // avoiding stateful g-flag regex in test().
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={`${i}-${part}`} className="srch-mark">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

// ── Per-book search helper (extracted to reduce runSearch complexity) ──────────
async function fetchFilteredResults(q: string, bookIds: string[]): Promise<SearchResult[]> {
  const batches = await Promise.allSettled(
    bookIds.map((id) => searchPassages({ query: q, bookId: id, topK: 10 })),
  );
  return batches
    .filter((b): b is PromiseFulfilledResult<SearchResult[]> => b.status === 'fulfilled')
    .flatMap((b) => b.value)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface BookGroup {
  documentId: string;
  title: string;
  results: SearchResult[];
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SkeletonLoader() {
  return (
    <div className="srch-skeleton">
      {[1, 2, 3].map((n) => (
        <div key={n} className="srch-skel-group">
          <div className="srch-skel-bar" style={{ height: 22, width: '30%' }} />
          {[1, 2].map((r) => (
            <div key={r} className="srch-skel-row" />
          ))}
        </div>
      ))}
    </div>
  );
}

function BookGroupSection({
  group,
  query,
  onNavigateBook,
  onNavigatePassage,
}: Readonly<{
  group: BookGroup;
  query: string;
  onNavigateBook: (bookId: string) => void;
  onNavigatePassage: (bookId: string, result: SearchResult) => void;
}>) {
  const { t } = useTranslation('search');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="srch-group">
      <div className="srch-group-header">
        <button
          type="button"
          className={`srch-group-toggle${collapsed ? ' collapsed' : ''}`}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? '展開' : '收合'}
        >
          <ChevronDown size={15} />
        </button>

        {/* h2 is purely semantic; navigation is handled by the goto button */}
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
          <ArrowUpRight size={13} />
        </button>
      </div>

      {!collapsed && (
        <div className="srch-rows">
          {group.results.map((result) => {
            const ch = result.metadata.chapterNumber;
            const pos = result.metadata.position;
            return (
              <button
                key={result.id}
                type="button"
                className="srch-row"
                onClick={() => onNavigatePassage(group.documentId, result)}
              >
                <span className="srch-row-pos">
                  第{ch}章·§{String(pos).padStart(2, '0')}
                </span>
                <p className="srch-row-text">{highlightText(result.text, query)}</p>
                <span className="srch-row-score">{Math.round(result.score * 100)}%</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const { t } = useTranslation('search');
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  // null = pre-search; [] = all books (cross-book, no chip filter); [ids] = filtered
  const [activeBookIds, setActiveBookIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prevents chips from being re-seeded when re-querying after chip removal
  const chipsSeededRef = useRef(false);
  // Generation counter to discard stale search responses
  const searchGenRef = useRef(0);

  const { data: books = [] } = useBooks();

  const bookTitleMap = useMemo(
    () => Object.fromEntries(books.map((b) => [b.id, b.title])),
    [books],
  );

  const hasBooks = books.length > 0;

  // ── Search execution ─────────────────────────────────────────────────────────
  const runSearch = useCallback(
    async (q: string, filterBookIds: string[] | null) => {
      if (!q.trim()) return;
      const gen = ++searchGenRef.current;
      setLoading(true);
      setError(null);

      try {
        let merged: SearchResult[];

        if (filterBookIds === null || filterBookIds.length === 0) {
          merged = await searchPassages({ query: q, topK: 20 });
          if (gen !== searchGenRef.current) return;

          // Seed chips only on the first search after a new submit
          if (!chipsSeededRef.current) {
            chipsSeededRef.current = true;
            setActiveBookIds([...new Set(merged.map((r) => r.metadata.documentId))]);
          }
        } else {
          merged = await fetchFilteredResults(q, filterBookIds);
          if (gen !== searchGenRef.current) return;
        }

        setResults(merged);
      } catch (err) {
        if (gen !== searchGenRef.current) return;
        console.error('[SearchPage] search failed', err);
        setError('搜尋失敗，請稍後再試。');
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
      void runSearch(query, null);
    },
    [query, runSearch],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setSubmittedQuery('');
    setResults(null);
    setActiveBookIds(null);
    chipsSeededRef.current = false;
  }, []);

  const handleRemoveChip = useCallback(
    (bookId: string) => {
      const next = (activeBookIds ?? []).filter((id) => id !== bookId);
      setActiveBookIds(next);
      // chipsSeededRef stays true → cross-book re-query won't re-seed chips
      void runSearch(submittedQuery, next.length > 0 ? next : null);
    },
    [activeBookIds, submittedQuery, runSearch],
  );

  // ── Derived groups ───────────────────────────────────────────────────────────
  const groups = useMemo<BookGroup[]>(() => {
    if (!results) return [];

    // null or [] → show all results; [ids] → filter to those books
    const filtered =
      activeBookIds !== null && activeBookIds.length > 0
        ? results.filter((r) => activeBookIds.includes(r.metadata.documentId))
        : results;

    const map = new Map<string, SearchResult[]>();
    for (const r of filtered) {
      const docId = r.metadata.documentId;
      if (!map.has(docId)) map.set(docId, []);
      map.get(docId)?.push(r);
    }

    return [...map.entries()].map(([documentId, docResults]) => ({
      documentId,
      title: bookTitleMap[documentId] ?? documentId,
      results: docResults,
    }));
  }, [results, activeBookIds, bookTitleMap]);

  const totalCount = groups.reduce((s, g) => s + g.results.length, 0);

  // ── Content renderer (avoids deeply nested ternaries in JSX) ─────────────────
  const hasSearched = submittedQuery !== '';
  const showChips = activeBookIds !== null && activeBookIds.length > 0;

  function renderContent() {
    if (!hasSearched) {
      if (hasBooks) {
        return (
          <div className="srch-initial">
            <div className="srch-initial-icon">
              <Search size={28} strokeWidth={1.7} />
            </div>
            <h1 className="srch-initial-title">{t('title')}</h1>
            <p className="srch-initial-sub">{t('subtitle')}</p>
          </div>
        );
      }
      return (
        <div className="srch-empty">
          <span style={{ color: 'var(--fg-muted)' }}>
            <Upload size={40} strokeWidth={1.25} />
          </span>
          <h2 className="srch-empty-title">{t('empty.noBooks')}</h2>
          <p className="srch-empty-hint">{t('empty.noBooksHint')}</p>
          <button
            type="button"
            className="srch-empty-btn"
            onClick={() => navigate('/upload')}
          >
            {t('empty.uploadNow')}
          </button>
        </div>
      );
    }

    if (loading) return <SkeletonLoader />;

    if (error) {
      return (
        <div className="srch-empty">
          <h2 className="srch-empty-title">{error}</h2>
        </div>
      );
    }

    if (groups.length === 0) {
      return (
        <div className="srch-empty">
          <h2 className="srch-empty-title">{t('empty.noResults')}</h2>
          <p className="srch-empty-hint">{t('empty.noResultsHint')}</p>
        </div>
      );
    }

    return (
      <>
        {/* Summary row */}
        <div className="srch-summary-row">
          <span>
            找到 <strong>{totalCount}</strong> 個段落，來自{' '}
            <strong>{groups.length}</strong> 本書籍
          </span>
          <span className="srch-sort-label">
            {t('sortByRelevance')}
            <ChevronDown size={13} />
          </span>
        </div>

        {/* Book filter chips — all chips shown in a scrollable row */}
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
                  aria-label={`移除 ${bookTitleMap[id] ?? id}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Result groups */}
        <div className="srch-groups">
          {groups.map((group) => (
            <BookGroupSection
              key={group.documentId}
              group={group}
              query={submittedQuery}
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
  return (
    <div className="srch-scroll">
      <div className="srch-page">
        {/* Hero search bar */}
        <form className="srch-hero" onSubmit={handleSubmit}>
          <span className="srch-hero-icon">
            <Search size={22} />
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
              aria-label="清除搜尋"
            >
              <X size={16} />
            </button>
          )}
          <span className="srch-scope-btn">
            {t('scopeAll')}
            <ChevronDown size={14} />
          </span>
          <button
            type="submit"
            className="srch-submit-btn"
            disabled={loading || !query.trim()}
          >
            <Search size={16} />
            {t('submit')}
          </button>
        </form>

        {/* Scope tabs */}
        <div className="srch-tabs">
          <button type="button" className="srch-tab active">
            {t('tabs.paragraph')}
            {hasSearched && results !== null && (
              <span className="srch-tab-count">{totalCount}</span>
            )}
          </button>
          <button type="button" className="srch-tab">
            {t('tabs.character')}
            <span className="srch-tab-soon">{t('comingSoon')}</span>
          </button>
          <button type="button" className="srch-tab">
            {t('tabs.archetype')}
            <span className="srch-tab-soon">{t('comingSoon')}</span>
          </button>
        </div>

        {renderContent()}
      </div>
    </div>
  );
}
