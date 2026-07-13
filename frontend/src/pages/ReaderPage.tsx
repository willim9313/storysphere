import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Brain, Search, ChevronLeft, ChevronRight, BookOpen, ArrowUp } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useChapters } from '@/hooks/useChapters';
import { useChunks } from '@/hooks/useChunks';
import { BookOverview } from '@/components/reader/BookOverview';
import { ChapterCard } from '@/components/reader/ChapterCard';
import { ChunkCard } from '@/components/reader/ChunkCard';
import { BezierConnectors } from '@/components/reader/BezierConnectors';
import { EpistemicSidePanel } from '@/components/reader/EpistemicSidePanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

const EPISTEMIC_HINT_KEY = 'storysphere:reader-epistemic-hint-shown';

// Below this width the three columns can't coexist, so col1/col2 default to
// collapsed and the bezier connectors are hidden (see RWD handling below).
const NARROW_QUERY = '(max-width: 768px)';
const getIsNarrow = () =>
  typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches;

const collapseButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 6,
  zIndex: 2,
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--fg-muted)',
  borderRadius: 4,
  padding: 0,
};

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { t } = useTranslation('reader');
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [viewingChapterId, setViewingChapterId] = useState<string | null>(null);
  const [epistemicOpen, setEpistemicOpen] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<'full' | 'characters' | 'off'>('full');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNarrow, setIsNarrow] = useState(getIsNarrow);
  const [col1Collapsed, setCol1Collapsed] = useState(getIsNarrow);
  const [col2Collapsed, setCol2Collapsed] = useState(getIsNarrow);
  const [colRevision, setColRevision] = useState(0);
  const [epistemicHintShown, setEpistemicHintShown] = useState(() => {
    try { return localStorage.getItem(EPISTEMIC_HINT_KEY) === 'true'; } catch { return true; }
  });
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const col1Ref = useRef<HTMLDivElement>(null);
  const col2Ref = useRef<HTMLDivElement>(null);
  const col3Ref = useRef<HTMLDivElement>(null);
  const col3ScrollRef = useRef<HTMLDivElement>(null);

  const { setPageContext } = useChatContext();
  const { data: book, isLoading: bookLoading, error: bookError } = useBook(bookId);
  const { data: chapters, isLoading: chaptersLoading } = useChapters(bookId);
  const { data: chunks, isLoading: chunksLoading } = useChunks(bookId, viewingChapterId);

  // Deep-link from other pages (currently SymbolsPage occurrence rows) into a
  // specific paragraph. Caller passes { paragraphId, chapterNumber } via
  // location.state — paragraphId matches Chunk.id on the wire.
  const location = useLocation();
  const jumpTarget = (location.state as { paragraphId?: string; chapterNumber?: number } | null) ?? null;
  const jumpHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jumpTarget?.paragraphId || !chapters) return;
    if (jumpHandledRef.current === jumpTarget.paragraphId) return;
    const target = chapters.find((c) => c.order === jumpTarget.chapterNumber);
    if (!target) return;
    // setState-in-effect is the standard sync-from-URL pattern for deep-links;
    // the alternative (compute in render) would force callers to also push a
    // chapter id into the URL which couples symbol-page state to reader state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedChapterId(target.id);
    setSelectedChapterId(target.id);
    setViewingChapterId(target.id);
  }, [jumpTarget, chapters]);

  useEffect(() => {
    const pid = jumpTarget?.paragraphId;
    if (!pid || !chunks || chunksLoading) return;
    if (jumpHandledRef.current === pid) return;
    if (!chunks.some((c) => c.id === pid)) return;
    const el = document.querySelector(`[data-chunk-id="${pid}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('chunk-jump-flash');
      globalThis.setTimeout(() => el.classList.remove('chunk-jump-flash'), 2000);
      jumpHandledRef.current = pid;
    }
  }, [jumpTarget, chunks, chunksLoading]);

  useEffect(() => {
    setPageContext({ page: 'reader', bookId, bookTitle: book?.title });
  }, [bookId, book?.title, setPageContext]);

  useEffect(() => {
    const chapter = chapters?.find((c) => c.id === viewingChapterId);
    setPageContext({
      chapterId: viewingChapterId ?? undefined,
      chapterTitle: chapter?.title,
      chapterNumber: chapter?.order,
    });
  }, [viewingChapterId, chapters, setPageContext]);

  const showEpistemicHint = !epistemicHintShown && !!viewingChapterId && !epistemicOpen;

  const dismissEpistemicHint = () => {
    try { localStorage.setItem(EPISTEMIC_HINT_KEY, 'true'); } catch { /* ignore */ }
    setEpistemicHintShown(true);
  };

  // P0: useMemo must be before early returns (Rules of Hooks)
  const chapterList = useMemo(() => chapters ?? [], [chapters]);
  const filteredChapterList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return chapterList;
    return chapterList.filter((chapter) =>
      chapter.title.toLowerCase().includes(q) ||
      chapter.topEntities?.some((e) => e.name?.toLowerCase().includes(q)) ||
      Object.keys(chapter.keywords ?? {}).some((k) => k.toLowerCase().includes(q))
    );
  }, [chapterList, searchQuery]);

  useEffect(() => {
    if (!showEpistemicHint) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(EPISTEMIC_HINT_KEY, 'true'); } catch { /* ignore */ }
      setEpistemicHintShown(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [showEpistemicHint]);

  // Collapse the two left columns when entering a narrow viewport; afterward
  // the user can still push-expand them manually.
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      setIsNarrow(e.matches);
      if (e.matches) {
        setCol1Collapsed(true);
        setCol2Collapsed(true);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Column 3 scroll container is reused across chapters, so switching
  // chapters (via col2, deep-link, or the prev/next nav buttons) needs an
  // explicit reset — otherwise the old scroll offset carries over. The
  // resulting scroll event (handleCol3Scroll) re-derives progress/showBackToTop.
  // Skipped while a deep-link jump is pending: with cached chunks the jump's
  // scrollIntoView fires in the same commit and this reset would clobber it.
  useEffect(() => {
    const pid = jumpTarget?.paragraphId;
    if (pid && jumpHandledRef.current !== pid) return;
    col3ScrollRef.current?.scrollTo({ top: 0 });
  }, [viewingChapterId, jumpTarget]);

  if (bookLoading || chaptersLoading) return <LoadingSpinner />;
  if (bookError) return <ErrorMessage message={bookError.message} />;
  if (!book) return <ErrorMessage message="Book not found" />;
  const selectedChapterIdx = filteredChapterList.findIndex((c) => c.id === expandedChapterId);
  const viewingChapter = chapterList.find((c) => c.id === viewingChapterId);
  const viewingChapterOrder = viewingChapter?.order ?? null;
  const viewingChapterIdx = chapterList.findIndex((c) => c.id === viewingChapterId);
  const prevChapter = viewingChapterIdx > 0 ? chapterList[viewingChapterIdx - 1] : null;
  const nextChapter =
    viewingChapterIdx >= 0 && viewingChapterIdx < chapterList.length - 1
      ? chapterList[viewingChapterIdx + 1]
      : null;

  const handleSelectChapter = (chapterId: string) => {
    setExpandedChapterId(chapterId);
    setSelectedChapterId(chapterId);
    setViewingChapterId(chapterId);
    setSearchQuery('');
  };

  const handleCol3Scroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    setScrollProgress(max > 0 ? el.scrollTop / max : 0);
    setShowBackToTop(el.scrollTop > 500);
  };

  const handleBackToTop = () => {
    col3ScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCol1Toggle = () => {
    setCol1Collapsed((v) => !v);
    setTimeout(() => setColRevision((r) => r + 1), 220);
  };

  const handleCol2Toggle = () => {
    setCol2Collapsed((v) => !v);
    setTimeout(() => setColRevision((r) => r + 1), 220);
  };

  return (
    <div className="flex h-full relative">
      {!isNarrow && (
        <BezierConnectors
          col1Ref={col1Ref}
          col2Ref={col2Ref}
          col3Ref={col3Ref}
          selectedChapterIdx={selectedChapterIdx}
          chapterKey={filteredChapterList.map((c) => c.id).join(',')}
          chunkCount={chunks?.length ?? 0}
          showCol3={!!viewingChapterId}
          colRevision={colRevision}
        />
      )}

      {/* Column 1: Book Overview */}
      <div
        ref={col1Ref}
        className="flex-shrink-0 relative"
        style={{
          width: col1Collapsed ? 36 : 232,
          transition: 'width 200ms ease',
          overflow: 'hidden',
          borderRight: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <button
          onClick={handleCol1Toggle}
          style={collapseButtonStyle}
          aria-label={col1Collapsed ? t('col1Expand') : t('col1Collapse')}
        >
          {col1Collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {!col1Collapsed ? (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <BookOverview book={book} />
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: 40,
            }}
          >
            <BookOpen size={16} style={{ color: 'var(--fg-muted)' }} />
          </div>
        )}
      </div>

      {/* Spacer between col1 and col2 — only when col1 is expanded */}
      {!col1Collapsed && <div className="flex-shrink-0" style={{ width: 24 }} />}

      {/* Column 2: Chapter List */}
      <div
        ref={col2Ref}
        className="flex-shrink-0 flex flex-col relative"
        style={{
          width: col2Collapsed ? 36 : 224,
          transition: 'width 200ms ease',
          overflow: 'hidden',
          borderRight: '1px solid var(--border)',
        }}
      >
        <button
          onClick={handleCol2Toggle}
          style={collapseButtonStyle}
          aria-label={col2Collapsed ? t('col2Expand') : t('col2Collapse')}
        >
          {col2Collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {!col2Collapsed ? (
          <>
            {/* Search — paddingRight leaves room for the absolute collapse button */}
            <div className="flex-shrink-0 p-2 pb-1" style={{ paddingRight: 30 }}>
              <div
                className="flex items-center gap-2 px-2 py-1 rounded-md"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                <Search size={12} style={{ color: 'var(--fg-muted)' }} />
                <input
                  type="search"
                  placeholder={t('search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label={t('search')}
                  className="bg-transparent text-xs flex-1 outline-none"
                  style={{ color: 'var(--fg-primary)' }}
                />
              </div>
            </div>

            {/* Chapter list */}
            <div className="flex-1 overflow-y-auto p-2 pt-1 space-y-1">
              {filteredChapterList.map((chapter) => (
                <div key={chapter.id} data-chapter-card>
                  <ChapterCard
                    chapter={chapter}
                    isSelected={selectedChapterId === chapter.id}
                    isExpanded={expandedChapterId === chapter.id}
                    onSelect={() => handleSelectChapter(chapter.id)}
                  />
                </div>
              ))}
              {filteredChapterList.length === 0 && searchQuery && (
                <p className="px-2 py-4 text-xs text-center" style={{ color: 'var(--fg-muted)' }}>
                  {t('searchEmpty', { query: searchQuery })}
                </p>
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: 40,
              gap: 6,
            }}
          >
            <BookOpen size={14} style={{ color: 'var(--fg-muted)' }} />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--font-size-2xs)',
                color: 'var(--fg-muted)',
                writingMode: 'vertical-rl',
                letterSpacing: '0.05em',
              }}
            >
              章節
            </span>
          </div>
        )}
      </div>

      {/* Spacer between col2 and col3 — only when col2 is expanded */}
      {!col2Collapsed && <div className="flex-shrink-0" style={{ width: 24 }} />}

      {/* Column 3: Chunk Content */}
      <div
        ref={col3Ref}
        className="flex-1 overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {viewingChapterId ? (
          <div
            ref={col3ScrollRef}
            style={{ height: '100%', overflowY: 'auto' }}
            onScroll={handleCol3Scroll}
          >
            {/* Sticky header */}
            <div
              className="sticky top-0 z-10"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderBottom: '1px solid var(--border)',
              }}
            >
            <div
              className="flex items-start justify-between"
              style={{
                padding: '12px 16px 8px',
              }}
            >
              <div>
                <div className="flex items-baseline flex-wrap" style={{ gap: 8 }}>
                  <h3
                    className="font-semibold"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--fg-primary)',
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {viewingChapter?.title}
                  </h3>
                  {viewingChapterOrder != null && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--fg-secondary)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--font-size-2xs)',
                        flexShrink: 0,
                      }}
                    >
                      {t('nav.chapterBadge', { current: viewingChapterOrder, total: chapterList.length })}
                    </span>
                  )}
                </div>
                <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {chunks?.length ?? 0} chunks
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div
                  className="flex items-center"
                  role="group"
                  aria-label={t('annotation.title')}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}
                >
                  {(['full', 'characters', 'off'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setAnnotationMode(m)}
                      style={{
                        padding: '5px 9px',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--font-size-2xs)',
                        backgroundColor: annotationMode === m ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: annotationMode === m ? 'white' : 'var(--fg-muted)',
                      }}
                    >
                      {t(`annotation.${m}`)}
                    </button>
                  ))}
                </div>
                <div className="relative">
                <button
                  onClick={() => {
                    setEpistemicOpen((v) => !v);
                    if (!epistemicHintShown) dismissEpistemicHint();
                  }}
                  className="flex items-center gap-1"
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    backgroundColor: epistemicOpen ? 'var(--accent)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: epistemicOpen ? 'white' : 'var(--fg-muted)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--font-size-2xs)',
                  }}
                >
                  <Brain size={13} color={epistemicOpen ? 'white' : 'var(--fg-muted)'} />
                  <span>{epistemicOpen ? t('epistemicClose') : t('epistemicLabel')}</span>
                </button>
                {showEpistemicHint && (
                  <div
                    onClick={dismissEpistemicHint}
                    className="absolute right-0 cursor-pointer"
                    style={{
                      top: 'calc(100% + 6px)',
                      zIndex: 20,
                      width: 200,
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <p className="text-xs" style={{ color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                      {t('epistemicHint')}
                    </p>
                  </div>
                )}
                </div>
              </div>
            </div>
              <div style={{ height: 2, backgroundColor: 'var(--bg-tertiary)' }}>
                <div
                  style={{
                    height: '100%',
                    backgroundColor: 'var(--accent)',
                    width: `${Math.round(scrollProgress * 100)}%`,
                    transition: 'width .1s linear',
                  }}
                />
              </div>
            </div>

            {/* Chunks */}
            <div style={{ padding: '16px' }} data-annotation-mode={annotationMode}>
              {chunksLoading && <LoadingSpinner />}
              {!chunksLoading &&
                chunks?.map((chunk) => (
                  <div key={chunk.id} data-chunk-id={chunk.id}>
                    <ChunkCard chunk={chunk} />
                  </div>
                ))}
              {!chunksLoading && (prevChapter ?? nextChapter) && (
                <div
                  className="flex items-center justify-between"
                  style={{ gap: 12, marginTop: 'var(--space-xl)' }}
                >
                  {prevChapter ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleSelectChapter(prevChapter.id)}
                    >
                      {t('nav.prev', { title: prevChapter.title })}
                    </button>
                  ) : (
                    <span />
                  )}
                  {nextChapter ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleSelectChapter(nextChapter.id)}
                    >
                      {t('nav.next', { title: nextChapter.title })}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              {t('selectChapter')}
            </p>
          </div>
        )}
      </div>

      {/* Column 4: Epistemic Side Panel */}
      {bookId && (
        <div
          className="flex-shrink-0 overflow-hidden"
          style={{
            width: epistemicOpen ? 280 : 0,
            transition: 'width 200ms ease',
          }}
        >
          {epistemicOpen && (
            <EpistemicSidePanel
              bookId={bookId}
              chapters={chapterList}
              currentChapterOrder={viewingChapterOrder}
              onClose={() => setEpistemicOpen(false)}
            />
          )}
        </div>
      )}

      {showBackToTop && (
        <button
          onClick={handleBackToTop}
          aria-label={t('nav.backToTop')}
          title={t('nav.backToTop')}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 88,
            zIndex: 30,
            width: 40,
            height: 40,
            borderRadius: '50%',
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-fg)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <ArrowUp size={18} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
