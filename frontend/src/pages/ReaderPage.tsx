import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Brain, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BookOpen, ArrowUp, Maximize } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBook } from '@/hooks/useBook';
import { useChapters } from '@/hooks/useChapters';
import { useChunks } from '@/hooks/useChunks';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { BookOverview } from '@/components/reader/BookOverview';
import { ChapterCard } from '@/components/reader/ChapterCard';
import { ChunkCard } from '@/components/reader/ChunkCard';
import { BezierConnectors } from '@/components/reader/BezierConnectors';
import { EpistemicSidePanel } from '@/components/reader/EpistemicSidePanel';
import { EntityCard } from '@/components/reader/EntityCard';
import { TypographyPanel, DEFAULT_READER_PREFS, type ReaderPrefs } from '@/components/reader/TypographyPanel';
import { EntityMarkClickProvider, type EntityMarkClickPayload } from '@/components/reader/SegmentRenderer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { EntityType } from '@/api/types';

const EPISTEMIC_HINT_KEY = 'storysphere:reader-epistemic-hint-shown';
const READER_PREFS_KEY = 'reader:prefs';
const READER_FS_PX = ['15px', '17px', '19px'];
const READER_LH = ['1.6', '1.85', '2.15'];

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
  // viewingChapterId doubles as "selected chapter" — there is only one chapter
  // being read in column 3 at a time. expandedChapters is the independent,
  // multi-open accordion state for column 2's chapter cards.
  const [viewingChapterId, setViewingChapterId] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [epistemicOpen, setEpistemicOpen] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<'full' | 'characters' | 'off'>('full');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNarrow, setIsNarrow] = useState(getIsNarrow);
  const [col1Collapsed, setCol1Collapsed] = useState(getIsNarrow);
  const [col2Collapsed, setCol2Collapsed] = useState(getIsNarrow);
  const [colRevision, setColRevision] = useState(0);
  // Focus mode is session-only (not persisted, unlike readerPrefs below). It
  // doesn't mutate col1Collapsed/col2Collapsed — the effective collapsed
  // state used for rendering is `col1Collapsed || focus` (see below), so the
  // underlying per-column preference is untouched and simply reappears once
  // focus turns back off. handleCol1Toggle/handleCol2Toggle additionally
  // no-op while focus is active, so a stray click during focus mode can't
  // change what gets restored on exit.
  const [focus, setFocus] = useState(false);
  const [readerPrefs, setReaderPrefs] = useLocalStorage<ReaderPrefs>(READER_PREFS_KEY, DEFAULT_READER_PREFS);
  const updateReaderPrefs = (patch: Partial<ReaderPrefs>) => setReaderPrefs((prev) => ({ ...prev, ...patch }));
  const [epistemicHintShown, setEpistemicHintShown] = useState(() => {
    try { return localStorage.getItem(EPISTEMIC_HINT_KEY) === 'true'; } catch { return true; }
  });
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [entityCard, setEntityCard] = useState<{
    entityId: string;
    name: string;
    type: EntityType;
    anchorRect: DOMRect;
  } | null>(null);

  const col1Ref = useRef<HTMLDivElement>(null);
  const col2Ref = useRef<HTMLDivElement>(null);
  // Actual scrollable chapter-list element (col2Ref's child) — BezierConnectors
  // needs this specific node to attach its own 'scroll' listener (scroll
  // events don't bubble) and to query `[data-chapter-card]` positions.
  const col2ListRef = useRef<HTMLDivElement>(null);
  const col3Ref = useRef<HTMLDivElement>(null);
  const col3ScrollRef = useRef<HTMLDivElement>(null);
  // Chunk-list wrapper (the max-width/CSS-var container) — scoped root for
  // the fade-in IntersectionObserver below, so it only ever observes this
  // chapter's `.rd-fade` chunks.
  const chunkListRef = useRef<HTMLDivElement>(null);
  // Chunk id awaiting scroll-into-view once a cross-chapter jump's target
  // chapter has finished switching and its chunks have rendered. A ref (not
  // state) — same one-shot-guard pattern as jumpHandledRef below — so
  // clearing it doesn't trip react-hooks/set-state-in-effect.
  const pendingJumpChunkRef = useRef<string | null>(null);

  const { setPageContext } = useChatContext();
  const { theme } = useTheme();
  const { data: book, isLoading: bookLoading, error: bookError } = useBook(bookId);
  const { data: chapters, isLoading: chaptersLoading } = useChapters(bookId);
  const { data: chunks, isLoading: chunksLoading } = useChunks(bookId, viewingChapterId);

  // Deep-link from other pages (currently SymbolsPage occurrence rows) into a
  // specific paragraph. Caller passes { paragraphId, chapterNumber } via
  // location.state — paragraphId matches Chunk.id on the wire.
  const location = useLocation();
  const jumpTarget = (location.state as { paragraphId?: string; chapterNumber?: number } | null) ?? null;
  const jumpHandledRef = useRef<string | null>(null);

  // Column 3 scroll container is reused across chapters, so switching
  // chapters (via col2, deep-link, or the prev/next nav buttons) needs an
  // explicit reset — otherwise the old scroll offset carries over. The
  // resulting scroll event (handleCol3Scroll) re-derives progress/showBackToTop.
  // Skipped while a deep-link or entity-card jump is pending. Deliberately
  // defined BEFORE the jump effects below: effects run in definition order,
  // so when a chapter switch and cached chunks land in the same commit this
  // reset sees the still-pending guards and skips — if it ran after them,
  // they would have already scrolled and cleared their guards, and the
  // scrollTo(0) here would clobber the jump.
  useEffect(() => {
    const pid = jumpTarget?.paragraphId;
    if (pid && jumpHandledRef.current !== pid) return;
    if (pendingJumpChunkRef.current) return;
    col3ScrollRef.current?.scrollTo({ top: 0 });
  }, [viewingChapterId, jumpTarget]);

  useEffect(() => {
    if (!jumpTarget?.paragraphId || !chapters) return;
    if (jumpHandledRef.current === jumpTarget.paragraphId) return;
    const target = chapters.find((c) => c.order === jumpTarget.chapterNumber);
    if (!target) return;
    // setState-in-effect is the standard sync-from-URL pattern for deep-links;
    // the alternative (compute in render) would force callers to also push a
    // chapter id into the URL which couples symbol-page state to reader state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedChapters((prev) => (prev[target.id] ? prev : { ...prev, [target.id]: true }));
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

  // Cross-chapter jump from the entity card popover (doJump): the target
  // chapter has already been switched to by handleJumpToChunk, so once its
  // chunks finish loading, scroll to and flash the target chunk. Same
  // scrollIntoView + chunk-jump-flash mechanism as the deep-link effect above.
  useEffect(() => {
    const chunkId = pendingJumpChunkRef.current;
    if (!chunkId || !chunks || chunksLoading) return;
    if (!chunks.some((c) => c.id === chunkId)) {
      pendingJumpChunkRef.current = null;
      return;
    }
    const el = document.querySelector(`[data-chunk-id="${chunkId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('chunk-jump-flash');
      globalThis.setTimeout(() => el.classList.remove('chunk-jump-flash'), 2000);
    }
    pendingJumpChunkRef.current = null;
  }, [chunks, chunksLoading]);

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
  // Search no longer filters chapters out of the list (canvas behavior): all
  // chapters stay rendered, non-matches are just dimmed via `dimmed` below.
  // null = no active search (nothing dimmed); a Set = active search, dim ids
  // not in it.
  const matchedChapterIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return null;
    const ids = new Set<string>();
    for (const chapter of chapterList) {
      const matches =
        chapter.title.toLowerCase().includes(q) ||
        chapter.topEntities?.some((e) => e.name?.toLowerCase().includes(q)) ||
        Object.keys(chapter.keywords ?? {}).some((k) => k.toLowerCase().includes(q));
      if (matches) ids.add(chapter.id);
    }
    return ids;
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

  // Typography panel's "fade in" preference: each chunk starts hidden
  // (`.rd-fade` in global.css) and plays the rd-fade animation once when it
  // scrolls into view, then stays visible (unobserve). Re-runs whenever the
  // preference toggles or a new chapter's chunks render, since those are new
  // DOM nodes needing fresh observers.
  useEffect(() => {
    if (!readerPrefs.fade) return;
    const root = chunkListRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('rd-in');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1 },
    );
    root.querySelectorAll('.rd-fade').forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [readerPrefs.fade, viewingChapterId, chunks]);

  if (bookLoading || chaptersLoading) return <LoadingSpinner />;
  if (bookError) return <ErrorMessage message={bookError.message} />;
  if (!book) return <ErrorMessage message="Book not found" />;
  // Index of the viewing (= selected) chapter within chapterList — the same
  // list rendered in column 2, so this also serves as BezierConnectors'
  // selectedChapterIdx (it queries data-chapter-card by index in that list).
  const viewingChapter = chapterList.find((c) => c.id === viewingChapterId);
  const viewingChapterOrder = viewingChapter?.order ?? null;
  const viewingChapterIdx = chapterList.findIndex((c) => c.id === viewingChapterId);
  const prevChapter = viewingChapterIdx > 0 ? chapterList[viewingChapterIdx - 1] : null;
  const nextChapter =
    viewingChapterIdx >= 0 && viewingChapterIdx < chapterList.length - 1
      ? chapterList[viewingChapterIdx + 1]
      : null;
  const allChaptersExpanded =
    chapterList.length > 0 && chapterList.every((c) => expandedChapters[c.id]);
  // Focus mode forces col1/col2 into their collapsed rail regardless of the
  // user's own col1Collapsed/col2Collapsed preference (see the `focus` state
  // comment above for how those get restored on exit).
  const col1CollapsedEffective = col1Collapsed || focus;
  const col2CollapsedEffective = col2Collapsed || focus;
  // Paper warmth only applies in Warm theme; Ink's column-3 background stays
  // pinned to --bg-primary regardless of the stored warmth preference.
  const paperBg = theme === 'ink' ? 'var(--bg-primary)' : `var(--paper-warmth-${readerPrefs.warmth})`;

  // Navigate: read this chapter in column 3. Also opens its column-2 card
  // (independent expand/collapse still works afterward via the chevron).
  const handleSelectChapter = (chapterId: string) => {
    setViewingChapterId(chapterId);
    setExpandedChapters((prev) => (prev[chapterId] ? prev : { ...prev, [chapterId]: true }));
  };

  const handleToggleChapterExpand = (chapterId: string) => {
    setExpandedChapters((prev) => ({ ...prev, [chapterId]: !prev[chapterId] }));
  };

  const handleToggleAllChapters = () => {
    if (allChaptersExpanded) {
      setExpandedChapters({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const c of chapterList) next[c.id] = true;
    setExpandedChapters(next);
  };

  // doJump: entity card "appearances" list target. Same chapter — scroll
  // immediately. Different chapter — switch chapters first and let the
  // pendingJumpChunkRef effect above scroll once that chapter's chunks load.
  const handleJumpToChunk = (chapterId: string, chunkId: string) => {
    if (chapterId !== viewingChapterId) {
      handleSelectChapter(chapterId);
      pendingJumpChunkRef.current = chunkId;
      return;
    }
    const el = document.querySelector(`[data-chunk-id="${chunkId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('chunk-jump-flash');
      globalThis.setTimeout(() => el.classList.remove('chunk-jump-flash'), 2000);
    }
  };

  const handleEntityMarkClick = (payload: EntityMarkClickPayload) => {
    setEntityCard({
      entityId: payload.entityId,
      name: payload.name,
      type: payload.type,
      anchorRect: payload.rect,
    });
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
    if (focus) return;
    setCol1Collapsed((v) => !v);
    setTimeout(() => setColRevision((r) => r + 1), 220);
  };

  const handleCol2Toggle = () => {
    if (focus) return;
    setCol2Collapsed((v) => !v);
    setTimeout(() => setColRevision((r) => r + 1), 220);
  };

  const handleFocusToggle = () => {
    setFocus((v) => !v);
    setTimeout(() => setColRevision((r) => r + 1), 220);
  };

  return (
    <div className="flex h-full relative">
      {/* Column 1: Book Overview */}
      <div
        ref={col1Ref}
        className="flex-shrink-0 relative"
        style={{
          width: col1CollapsedEffective ? 46 : 250,
          transition: 'width 200ms ease',
          overflow: 'hidden',
          borderRight: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div style={{ height: '100%', overflowY: col1CollapsedEffective ? 'hidden' : 'auto' }}>
          <BookOverview book={book} collapsed={col1CollapsedEffective} onToggleCollapse={handleCol1Toggle} />
        </div>
      </div>

      {/* Spacer between col1 and col2 — only when col1 is expanded */}
      {!col1CollapsedEffective && <div className="flex-shrink-0" style={{ width: 24 }} />}

      {/* Column 2: Chapter List */}
      <div
        ref={col2Ref}
        className="flex-shrink-0 flex flex-col relative"
        style={{
          width: col2CollapsedEffective ? 36 : 224,
          transition: 'width 200ms ease',
          overflow: 'hidden',
          borderRight: '1px solid var(--border)',
        }}
      >
        <button
          onClick={handleCol2Toggle}
          style={collapseButtonStyle}
          aria-label={col2CollapsedEffective ? t('col2Expand') : t('col2Collapse')}
        >
          {col2CollapsedEffective ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {!col2CollapsedEffective ? (
          <>
            {/* Header — paddingRight leaves room for the absolute collapse button */}
            <div className="flex-shrink-0 p-2 pb-1" style={{ paddingRight: 30 }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>
                  {t('chapterListHeader', { count: chapterList.length })}
                </span>
                <button
                  onClick={handleToggleAllChapters}
                  className="flex items-center gap-1"
                  style={{
                    background: 'transparent',
                    color: 'var(--fg-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--font-size-2xs)',
                    padding: '3px 8px',
                  }}
                >
                  {allChaptersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {allChaptersExpanded ? t('collapseAll') : t('expandAll')}
                </button>
              </div>
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
              {matchedChapterIds !== null && (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {matchedChapterIds.size > 0
                    ? t('searchMatchCount', { count: matchedChapterIds.size })
                    : t('searchEmpty', { query: searchQuery })}
                </p>
              )}
            </div>

            {/* Chapter list — search dims non-matches instead of removing them */}
            <div ref={col2ListRef} className="flex-1 overflow-y-auto p-2 pt-1 space-y-1">
              {chapterList.map((chapter) => (
                <div key={chapter.id} data-chapter-card>
                  <ChapterCard
                    chapter={chapter}
                    isSelected={viewingChapterId === chapter.id}
                    isExpanded={!!expandedChapters[chapter.id]}
                    dimmed={matchedChapterIds !== null && !matchedChapterIds.has(chapter.id)}
                    onSelect={() => handleSelectChapter(chapter.id)}
                    onToggleExpand={() => handleToggleChapterExpand(chapter.id)}
                    onEntityClick={handleEntityMarkClick}
                  />
                </div>
              ))}
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

      {/* Bezier connectors — real 34px column between col2 and col3 (not an
          overlay). Hidden (renders nothing, 0 width) when col2 is collapsed,
          no chapter is selected, focus mode is on, or the viewport is narrow. */}
      {!isNarrow && (
        <BezierConnectors
          col2ScrollRef={col2ListRef}
          col3ScrollRef={col3ScrollRef}
          selectedChapterIdx={viewingChapterIdx}
          viewingChapterId={viewingChapterId}
          chunkCount={chunks?.length ?? 0}
          visible={!col2Collapsed && !!viewingChapterId && !focus}
          colRevision={colRevision}
        />
      )}

      {/* Column 3: Chunk Content */}
      <div
        ref={col3Ref}
        className="flex-1 overflow-hidden"
        style={{ backgroundColor: paperBg }}
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
                backgroundColor: paperBg,
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
                <TypographyPanel prefs={readerPrefs} onChange={updateReaderPrefs} />
                <button
                  onClick={handleFocusToggle}
                  className="flex items-center gap-1"
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    backgroundColor: focus ? 'var(--accent)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: focus ? 'white' : 'var(--fg-muted)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--font-size-2xs)',
                  }}
                >
                  <Maximize size={13} color={focus ? 'white' : 'var(--fg-muted)'} />
                  <span>{t('focusLabel')}</span>
                </button>
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
              {!chunksLoading && (
                <div
                  ref={chunkListRef}
                  style={{
                    maxWidth: focus ? 760 : '100%',
                    margin: '0 auto',
                    transition: 'max-width 200ms ease',
                    ['--reader-fs' as string]: READER_FS_PX[readerPrefs.fs],
                    ['--reader-lh' as string]: READER_LH[readerPrefs.lh],
                  } as React.CSSProperties}
                >
                  <EntityMarkClickProvider onEntityClick={handleEntityMarkClick}>
                    {chunks?.map((chunk) => (
                      <div
                        key={chunk.id}
                        data-chunk-id={chunk.id}
                        className={readerPrefs.fade ? 'rd-fade' : undefined}
                      >
                        <ChunkCard chunk={chunk} onEntityClick={handleEntityMarkClick} />
                      </div>
                    ))}
                  </EntityMarkClickProvider>
                  {(prevChapter ?? nextChapter) && (
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
            width: epistemicOpen ? 288 : 0,
            transition: 'width 200ms ease',
          }}
        >
          {epistemicOpen && (
            <EpistemicSidePanel
              bookId={bookId}
              chapters={chapterList}
              currentChapterOrder={viewingChapterOrder}
              onClose={() => setEpistemicOpen(false)}
              onJumpToChapter={(chapterNumber) => {
                const target = chapterList.find((c) => c.order === chapterNumber);
                if (target) handleSelectChapter(target.id);
              }}
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

      {entityCard && bookId && (
        <EntityCard
          bookId={bookId}
          entityId={entityCard.entityId}
          name={entityCard.name}
          type={entityCard.type}
          anchorRect={entityCard.anchorRect}
          onClose={() => setEntityCard(null)}
          onJump={handleJumpToChunk}
        />
      )}
    </div>
  );
}
