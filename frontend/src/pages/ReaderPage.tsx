import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Search, ChevronLeft, ChevronRight, ArrowUp } from 'lucide-react';
import { useChatDispatch } from '@/contexts/ChatContext';
import { useTheme } from '@/contexts/ThemeContext';
import { RAIL, useRailOccupant } from '@/contexts/FloatRailContext';
import { useBook } from '@/hooks/useBook';
import { useChapters } from '@/hooks/useChapters';
import { useChunks } from '@/hooks/useChunks';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { BookOverview } from '@/components/reader/BookOverview';
import { ChapterCard, ChapterMatterGroup } from '@/components/reader/ChapterCard';
import { ChunkCard } from '@/components/reader/ChunkCard';
import { BezierConnectors } from '@/components/reader/BezierConnectors';
import { EpistemicSidePanel } from '@/components/reader/EpistemicSidePanel';
import { EntityCard } from '@/components/reader/EntityCard';
import { TypographyPanel } from '@/components/reader/TypographyPanel';
import {
  DEFAULT_READER_PREFS,
  FS_PX,
  groupChapters,
  protectCol3,
  LH_VALUES,
  normalizePrefs,
  paperBackground,
  resetTypography,
  resolveTypography,
  withTypography,
  type OpenColumns,
  type ReaderMode,
  type ReaderPrefs,
  type Typography,
} from '@/components/reader/readerModel';
import { EntityMarkClickProvider, type EntityMarkClickPayload } from '@/components/reader/SegmentRenderer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { GuidanceRibbon } from '@/components/ui/GuidanceRibbon';
import { PageFailure } from '@/components/ui/PageFailure';
import { Tooltip } from '@/components/ui/Tooltip';
import { ApiError } from '@/api/client';
import { failureKind, techDetailOf } from '@/api/failureKind';
import type { EntityType } from '@/api/types';
import '@/styles/reader.css';

const EPISTEMIC_HINT_KEY = 'storysphere:reader-epistemic-hint-shown';
const READER_PREFS_KEY = 'reader:prefs';

// Below this width the three columns can't coexist, so col1/col2 default to
// collapsed and the bezier connectors are hidden (see RWD handling below).
const NARROW_QUERY = '(max-width: 768px)';
const getIsNarrow = () =>
  typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches;

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { t } = useTranslation('reader');
  const { t: tu } = useTranslation('upload');
  // The back-to-top FAB flickers in and out with scrolling, so its rail slot
  // is held for the whole route, not just while it is visible (rail R2).
  useRailOccupant('fabReserved', true);
  // viewingChapterId doubles as "selected chapter" — there is only one chapter
  // being read in column 3 at a time. expandedChapters is the independent,
  // multi-open accordion state for column 2's chapter cards.
  const [viewingChapterId, setViewingChapterId] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [epistemicOpen, setEpistemicOpen] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<'full' | 'characters' | 'off'>('full');
  // 檢視's annotation density, restored when leaving 專注 (see handleModeChange).
  const viewAnnotationRef = useRef<'full' | 'characters' | 'off'>('full');
  const [searchQuery, setSearchQuery] = useState('');
  // 卷首／卷末 groups start collapsed and are not persisted (UI_SPEC §3.3).
  const [matterOpen, setMatterOpen] = useState({ front: false, back: false });
  const [isNarrow, setIsNarrow] = useState(getIsNarrow);
  const [col1Collapsed, setCol1Collapsed] = useState(getIsNarrow);
  const [col2Collapsed, setCol2Collapsed] = useState(getIsNarrow);
  const [colRevision, setColRevision] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);
  // Focus mode is session-only (not persisted). It doesn't mutate
  // col1Collapsed/col2Collapsed — the effective collapsed state used for
  // rendering is `col1Collapsed || focus` (see below), so the underlying
  // per-column preference is untouched and simply reappears once focus turns
  // back off. handleCol1Toggle/handleCol2Toggle additionally no-op while focus
  // is active, so a stray click during focus mode can't change what gets
  // restored on exit. (The collapsed state itself is not persisted today; that
  // is unchanged.)
  const [focus, setFocus] = useState(false);
  // One set of fs / lh / warmth / fade shared by 檢視 and 專注. `reader:prefs`
  // may still hold an older shape (incl. per-mode view/focus); normalizePrefs
  // reads it and every write goes back out flat.
  const [storedPrefs, setStoredPrefs] = useLocalStorage<Record<string, unknown>>(READER_PREFS_KEY, DEFAULT_READER_PREFS);
  const readerPrefs = useMemo(() => normalizePrefs(storedPrefs), [storedPrefs]);
  const mode: ReaderMode = focus ? 'focus' : 'view';
  const typography = resolveTypography(readerPrefs);
  const updateTypography = (patch: Partial<Typography>) =>
    setStoredPrefs((prev) => withTypography(normalizePrefs(prev), patch));
  const resetModeTypography = () => setStoredPrefs((prev) => resetTypography(normalizePrefs(prev)));
  const updateSharedPrefs = (patch: Partial<Pick<ReaderPrefs, 'warmth' | 'fade'>>) =>
    setStoredPrefs((prev) => ({ ...normalizePrefs(prev), ...patch }));
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

  const { setPageContext } = useChatDispatch();
  const { theme } = useTheme();
  const { data: book, isLoading: bookLoading, error: bookError, refetch: refetchBook } = useBook(bookId);
  const { data: chapters, isLoading: chaptersLoading } = useChapters(bookId, true);
  const { data: chunks, isLoading: chunksLoading } = useChunks(bookId, viewingChapterId);

  // Deep-link from other pages (currently SymbolsPage occurrence rows) into a
  // specific paragraph. Caller passes { paragraphId, chapterNumber } via
  // location.state — paragraphId matches Chunk.id on the wire.
  const location = useLocation();
  // markTerms: the symbol page also sends the word (and its variants) it jumped
  // for, so the paragraph marks it instead of only flashing the whole card.
  const jumpTarget =
    (location.state as {
      paragraphId?: string;
      chapterNumber?: number;
      markTerms?: string[];
    } | null) ?? null;
  const jumpHandledRef = useRef<string | null>(null);

  // Column 3 scroll container is reused across chapters, so switching
  // chapters (via col2, deep-link, or the next-chapter button) needs an
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
      // Non-body `order` is not a story chapter number (0, N+1 …).
      chapterNumber: chapter?.role === 'body' ? chapter.order : undefined,
    });
  }, [viewingChapterId, chapters, setPageContext]);

  // Not on 卷首／卷末: the button is disabled there, so the hint would point at nothing.
  const showEpistemicHint =
    !epistemicHintShown &&
    !epistemicOpen &&
    chapters?.find((c) => c.id === viewingChapterId)?.role === 'body';

  const dismissEpistemicHint = () => {
    try { localStorage.setItem(EPISTEMIC_HINT_KEY, 'true'); } catch { /* ignore */ }
    setEpistemicHintShown(true);
  };

  // P0: useMemo must be before early returns (Rules of Hooks)
  // `chapterList` is body chapters only — the reading flow (next chapter,
  // Bezier index, chapter count, epistemic) never sees 卷首／卷末 matter.
  const chapterGroups = useMemo(() => groupChapters(chapters ?? []), [chapters]);
  const chapterList = chapterGroups.body;
  // Search no longer filters chapters out of the list (canvas behavior): all
  // chapters stay rendered, non-matches are just dimmed via `dimmed` below.
  // null = no active search (nothing dimmed); a Set = active search, dim ids
  // not in it.
  const matchedChapterIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return null;
    const ids = new Set<string>();
    for (const chapter of chapters ?? []) {
      const matches =
        chapter.title.toLowerCase().includes(q) ||
        chapter.topEntities?.some((e) => e.name?.toLowerCase().includes(q)) ||
        Object.keys(chapter.keywords ?? {}).some((k) => k.toLowerCase().includes(q));
      if (matches) ids.add(chapter.id);
    }
    return ids;
  }, [chapters, searchQuery]);

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

  // Shrinking the window (e.g. snapping to half-screen) re-applies the
  // column-3 guard; nothing was "just opened", so col1 goes first.
  useEffect(() => {
    if (focus) return;
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        applyCol3Guard(null, { col1: !col1Collapsed, col2: !col2Collapsed, col4: epistemicOpen }),
      );
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
    // applyCol3Guard reads only the state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col1Collapsed, col2Collapsed, epistemicOpen, isNarrow, focus]);

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
  if (bookError || !book) {
    // 404 (or no book at all) is its own fourth state — 「找不到書籍」; anything
    // else is the settled page / backend failure split. The sidebar and the
    // book title bar stay (BookLayout), so only the content area is replaced.
    const notFound = !bookError || (bookError instanceof ApiError && bookError.status === 404);
    return (
      <div className="rd-failure">
        <PageFailure
          variant={bookError ? failureKind(bookError) : 'page'}
          pageName={t('failurePageName')}
          title={notFound ? t('notFound') : undefined}
          onRetry={() => void refetchBook()}
          techDetail={bookError ? techDetailOf(bookError) : undefined}
          secondaryAction={
            <Link to="/" className="ss-btn ss-btn-md ss-btn-secondary">
              {t('failure.backToOverview')}
            </Link>
          }
        />
      </div>
    );
  }
  // Index of the viewing (= selected) chapter within chapterList — the same
  // list rendered in column 2, so this also serves as BezierConnectors'
  // selectedChapterIdx (it queries data-chapter-card by index in that list).
  const viewingChapter = chapters?.find((c) => c.id === viewingChapterId);
  const viewingNonBody = !!viewingChapter && viewingChapter.role !== 'body';
  const viewingChapterOrder = viewingChapter?.order ?? null;
  const viewingChapterIdx = chapterList.findIndex((c) => c.id === viewingChapterId);
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
  const paperBg = paperBackground(theme, readerPrefs.warmth);

  // Navigate: read this chapter in column 3. Also opens its column-2 card
  // (independent expand/collapse still works afterward via the chevron).
  const handleSelectChapter = (chapterId: string) => {
    setViewingChapterId(chapterId);
    // The epistemic panel is cut off by story chapter number, which non-body
    // matter doesn't have — close it rather than leave the last chapter's state up.
    const role = chapters?.find((c) => c.id === chapterId)?.role;
    if (role && role !== 'body') setEpistemicOpen(false);
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

  // Column-3 guard (UI_SPEC §3.3): opening a column that would squeeze the
  // reading column under 360px collapses col1, then col2 — never `opened`.
  const applyCol3Guard = (opened: keyof OpenColumns | null, open: OpenColumns) => {
    const width = pageRef.current?.clientWidth;
    const next = width ? protectCol3(width, open, isNarrow, opened) : open;
    setCol1Collapsed(!next.col1);
    setCol2Collapsed(!next.col2);
  };

  const handleCol1Toggle = () => {
    if (focus) return;
    if (col1Collapsed) applyCol3Guard('col1', { col1: true, col2: !col2Collapsed, col4: epistemicOpen });
    else setCol1Collapsed(true);
    setTimeout(() => setColRevision((r) => r + 1), 220);
  };

  const handleCol2Toggle = () => {
    if (focus) return;
    if (col2Collapsed) applyCol3Guard('col2', { col1: !col1Collapsed, col2: true, col4: epistemicOpen });
    else setCol2Collapsed(true);
    setTimeout(() => setColRevision((r) => r + 1), 220);
  };

  const handleEpistemicToggle = () => {
    if (!epistemicOpen) {
      applyCol3Guard('col4', { col1: !col1Collapsed, col2: !col2Collapsed, col4: true });
    }
    setEpistemicOpen((v) => !v);
    if (!epistemicHintShown) dismissEpistemicHint();
  };

  // 專注 is for reading: it starts at annotation density 「角色」 (still
  // changeable), and leaving it restores whatever 檢視 had (UI_SPEC §3.3).
  const handleModeChange = (next: ReaderMode) => {
    if ((next === 'focus') === focus) return;
    if (next === 'focus') {
      viewAnnotationRef.current = annotationMode;
      setAnnotationMode('characters');
    } else {
      setAnnotationMode(viewAnnotationRef.current);
    }
    setFocus(next === 'focus');
    setTimeout(() => setColRevision((r) => r + 1), 220);
  };

  return (
    <div ref={pageRef} className="rd-page">
      {/* Column 1: Book Overview */}
      <div
        ref={col1Ref}
        className="rd-col1"
        style={{ width: col1CollapsedEffective ? 46 : 250 }}
      >
        <div className="rd-col1-scroll" style={{ overflowY: col1CollapsedEffective ? 'hidden' : 'auto' }}>
          <BookOverview book={book} collapsed={col1CollapsedEffective} onToggleCollapse={handleCol1Toggle} />
        </div>
      </div>

      {/* Spacer between col1 and col2 — only when col1 is expanded */}
      {!col1CollapsedEffective && <div className="flex-shrink-0" style={{ width: 24 }} />}

      {/* Column 2: Chapter List */}
      <div
        ref={col2Ref}
        className="rd-col2"
        style={{ width: col2CollapsedEffective ? 36 : 224 }}
      >
        {!col2CollapsedEffective ? (
          <>
            <div className="rd-col2-collapse">
              <Tooltip label={t('col2Collapse')}>
                <button
                  type="button"
                  onClick={handleCol2Toggle}
                  className="rd-icon-btn"
                  aria-label={t('col2Collapse')}
                >
                  <ChevronLeft size={12} />
                </button>
              </Tooltip>
            </div>
            {/* Header — right padding leaves room for the absolute collapse button */}
            <div className="rd-col2-head">
              <div className="rd-col2-head-row">
                <span className="rd-label">
                  {t('chapterListHeader', { count: chapterList.length })}
                </span>
                <button
                  type="button"
                  onClick={handleToggleAllChapters}
                  className="ss-btn ss-btn-sm ss-btn-secondary"
                >
                  {allChaptersExpanded ? t('collapseAll') : t('expandAll')}
                </button>
              </div>
              <div className="rd-search">
                <Search size={12} />
                <input
                  type="search"
                  placeholder={t('search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label={t('search')}
                />
              </div>
              {matchedChapterIds !== null && (
                <p className="rd-search-note">
                  {matchedChapterIds.size > 0
                    ? t('searchMatchCount', { count: matchedChapterIds.size })
                    : t('searchEmpty', { query: searchQuery })}
                </p>
              )}
            </div>

            {/* Chapter list — search dims non-matches instead of removing them */}
            <div ref={col2ListRef} className="rd-chapter-list">
              <ChapterMatterGroup
                position="front"
                chapters={chapterGroups.front}
                isOpen={matterOpen.front}
                onToggle={() => setMatterOpen((m) => ({ ...m, front: !m.front }))}
                selectedChapterId={viewingChapterId}
                matchedChapterIds={matchedChapterIds}
                onSelect={handleSelectChapter}
              />
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
              <ChapterMatterGroup
                position="back"
                chapters={chapterGroups.back}
                isOpen={matterOpen.back}
                onToggle={() => setMatterOpen((m) => ({ ...m, back: !m.back }))}
                selectedChapterId={viewingChapterId}
                matchedChapterIds={matchedChapterIds}
                onSelect={handleSelectChapter}
              />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={handleCol2Toggle}
            className="rd-rail-btn"
            aria-label={t('col2Expand')}
          >
            <ChevronRight size={12} />
            <span className="rd-rail-label">{t('col2Rail')}</span>
          </button>
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
          visible={!col2Collapsed && !!viewingChapterId && !focus && !viewingNonBody}
          colRevision={colRevision}
        />
      )}

      {/* Column 3: Chunk Content */}
      <div ref={col3Ref} className="rd-col3" style={{ backgroundColor: paperBg }}>
        {viewingChapterId ? (
          <div ref={col3ScrollRef} className="rd-col3-scroll" onScroll={handleCol3Scroll}>
            {/* Sticky header — toolbar order: 檢視／專注 → 標註密度 → 認知狀態 → Aa */}
            <div className="rd-head" style={{ backgroundColor: paperBg }}>
              <div className="rd-head-row">
                <div className="rd-head-titles">
                  <div className="rd-head-title-row">
                    <h3 className="rd-head-title">
                      {viewingNonBody && !viewingChapter?.title
                        ? tu(`review.chapterType.${viewingChapter?.role}`)
                        : viewingChapter?.title}
                    </h3>
                    {viewingNonBody ? (
                      // Untitled matter already shows its role as the title.
                      viewingChapter?.title && (
                        <span className="ss-badge">{tu(`review.chapterType.${viewingChapter.role}`)}</span>
                      )
                    ) : viewingChapterOrder != null && (
                      <span className="ss-badge" style={{ fontFamily: 'var(--font-mono)' }}>
                        {t('nav.chapterBadge', { current: viewingChapterOrder, total: chapterList.length })}
                      </span>
                    )}
                  </div>
                  <span className="rd-head-sub">{chunks?.length ?? 0} chunks</span>
                </div>
                <div className="rd-tools">
                  <div className="ss-seg" role="group" aria-label={t('viewLabel')}>
                    {(['view', 'focus'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`ss-seg-item${mode === m ? ' active' : ''}`}
                        aria-pressed={mode === m}
                        onClick={() => handleModeChange(m)}
                      >
                        {m === 'view' ? t('viewLabel') : t('focusLabel')}
                      </button>
                    ))}
                  </div>
                  <div className="ss-seg" role="group" aria-label={t('annotation.title')}>
                    {(['full', 'characters', 'off'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`ss-seg-item${annotationMode === m ? ' active' : ''}`}
                        aria-pressed={annotationMode === m}
                        onClick={() => setAnnotationMode(m)}
                      >
                        {t(`annotation.${m}`)}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <Tooltip label={t('matter.epistemicDisabled')} disabled={!viewingNonBody}>
                      <button
                        type="button"
                        onClick={handleEpistemicToggle}
                        disabled={viewingNonBody}
                        aria-expanded={epistemicOpen}
                        className={`ss-btn ss-btn-sm ss-btn-ghost${epistemicOpen ? ' rd-tool-on' : ''}`}
                      >
                        {epistemicOpen ? t('epistemicClose') : t('epistemicLabel')}
                      </button>
                    </Tooltip>
                    {showEpistemicHint && (
                      <div onClick={dismissEpistemicHint} className="rd-hint">
                        <p>{t('epistemicHint')}</p>
                      </div>
                    )}
                  </div>
                  <TypographyPanel
                    prefs={readerPrefs}
                    onTypography={updateTypography}
                    onResetTypography={resetModeTypography}
                    onPrefs={updateSharedPrefs}
                  />
                </div>
              </div>
              <div className="rd-progress">
                <div style={{ width: `${Math.round(scrollProgress * 100)}%` }} />
              </div>
            </div>

            {/* Chunks */}
            {/* Non-body matter was never extracted: always plain prose, without
                touching the user's annotation preference. */}
            <div className="rd-chunks" data-annotation-mode={viewingNonBody ? 'off' : annotationMode}>
              {chunksLoading && <LoadingSpinner />}
              {!chunksLoading && (
                <div
                  ref={chunkListRef}
                  className="rd-chunks-inner"
                  data-mode={mode}
                  style={{
                    ['--reader-fs' as string]: FS_PX[typography.fs],
                    ['--reader-lh' as string]: LH_VALUES[typography.lh],
                  } as React.CSSProperties}
                >
                  <EntityMarkClickProvider onEntityClick={handleEntityMarkClick}>
                    {chunks?.map((chunk) => (
                      <div
                        key={chunk.id}
                        data-chunk-id={chunk.id}
                        className={readerPrefs.fade ? 'rd-fade' : undefined}
                      >
                        <ChunkCard
                          chunk={chunk}
                          onEntityClick={handleEntityMarkClick}
                          markTerms={
                            chunk.id === jumpTarget?.paragraphId ? jumpTarget.markTerms : undefined
                          }
                        />
                      </div>
                    ))}
                  </EntityMarkClickProvider>
                  {/* 章末只放右側「下一章」；最後一章沒有。 */}
                  {nextChapter && (
                    <div className="rd-next">
                      <button
                        type="button"
                        className="ss-btn ss-btn-sm ss-btn-secondary"
                        onClick={() => handleSelectChapter(nextChapter.id)}
                      >
                        {t('nav.next', { title: nextChapter.title })}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* The ribbon lives in the landing state, not above the reading pane:
             this is where a first visit starts, and once a chapter is open the
             reader wants the text, not a banner eating the top of it. */
          <div className="rd-landing">
            <GuidanceRibbon surface="reader">
              <strong>{t('guide.prefix')}</strong>{' '}
              <Trans i18nKey="guide.body" ns="reader" components={{ strong: <strong /> }} />
            </GuidanceRibbon>
            <p className="rd-landing-prompt">{t('selectChapter')}</p>
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
                if (!target) return;
                if (target.id === viewingChapterId) {
                  // Same-chapter fallback: selecting the current chapter is a
                  // state no-op, so give explicit feedback by scrolling to top.
                  col3ScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  handleSelectChapter(target.id);
                }
              }}
              onJumpToChunk={(chapterNumber, chunkId) => {
                const target = chapterList.find((c) => c.order === chapterNumber);
                if (target) handleJumpToChunk(target.id, chunkId);
              }}
            />
          )}
        </div>
      )}

      {showBackToTop && (
        // right + 4：40px FAB 與 48px 泡泡同中線（(48-40)/2）
        <div className="rd-fab-wrap" style={{ right: RAIL.right + 4, bottom: RAIL.slots[1], zIndex: RAIL.z.fab }}>
          <Tooltip label={t('nav.backToTop')}>
            <button type="button" onClick={handleBackToTop} aria-label={t('nav.backToTop')} className="rd-fab">
              <ArrowUp size={18} strokeWidth={2.2} />
            </button>
          </Tooltip>
        </div>
      )}

      {entityCard && bookId && (
        <EntityCard
          bookId={bookId}
          entityId={entityCard.entityId}
          name={entityCard.name}
          type={entityCard.type}
          anchorRect={entityCard.anchorRect}
          onClose={() => setEntityCard(null)}
          // Close first: left open, the card sits on top of the flashing target.
          onJump={(chapterId, chunkId) => {
            setEntityCard(null);
            handleJumpToChunk(chapterId, chunkId);
          }}
        />
      )}
    </div>
  );
}
