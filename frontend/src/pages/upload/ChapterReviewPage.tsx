import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, CircleCheck, Info, Loader2, PanelLeft, X } from 'lucide-react';
import { fetchReviewData, parseToc, submitReview, suggestRoles } from '@/api/ingest';
import type { SuggestRolesResponse, TocEntry } from '@/api/ingest';
import { deleteBook } from '@/api/books';
import { ApiError } from '@/api/client';
import { failureKind, isLlmUnconfigured, LLM_SETTINGS_PATH, techDetailOf } from '@/api/failureKind';
import type { ReviewChapter } from '@/api/types';
import { useBook } from '@/hooks/useBook';
import { PageFailure } from '@/components/ui/PageFailure';
import { Tooltip } from '@/components/ui/Tooltip';
import { applyBoundaries } from './applyBoundaries';
import { buildSubmitPayload, normalizeSplitOffsets, pieceKey, splitPiece } from './paragraphSplits';
import {
  OVERVIEW_LABEL_MIN,
  isMisSplit,
  overviewHeights,
  railBarHeight,
  spineBlockHeight,
} from './spineLayout';
import '@/styles/chapter-review.css';

const CHAPTER_ROLES = ['body', 'toc', 'preface', 'afterword', 'other'] as const;
const PARA_ROLES = ['body', 'separator', 'section', 'epigraph', 'preamble'] as const;

type Phase = 'reviewing' | 'submitting' | 'cancelling';
/** A validated in-paragraph text selection, plus where to float the split button. */
type SelSplit = { ci: number; pi: number; start: number; end: number; x: number; y: number };
type AiStatus = 'idle' | 'loading' | 'done';
type TocStatus = 'idle' | 'loading' | 'done' | 'empty' | 'error' | 'unconfigured';
type SpineMode = 'chapter' | 'overview';
type NoteKind = 'info' | 'success' | 'error' | 'warning';
/** `settings`: append the in-page「前往 LLM 設定 →」link (the 503 state). */
type Note = { text: string; kind: NoteKind; settings?: boolean } | null;
/** A load / submit failure that replaces the content area (H frame). */
type Failure = { op: 'load' | 'submit'; err: unknown } | null;

const AI_LABEL_KEY: Record<AiStatus, string> = {
  idle: 'review.suggestRoles',
  loading: 'review.suggesting',
  done: 'review.suggestDone',
};

/** Re-index chapters so chapterIdx matches array position after a mutation. */
function reindex(chapters: ReviewChapter[]): ReviewChapter[] {
  return chapters.map((c, i) => ({ ...c, chapterIdx: i }));
}

/** 409 = the review window is not open (any more). `code` comes from sub-task 1-3a. */
function conflictCode(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  return err.code || 'review_not_open';
}

function Banner({ kind, children, action }: Readonly<{ kind: NoteKind; children: ReactNode; action?: ReactNode }>) {
  let icon: ReactNode = <Info size={16} />;
  if (kind === 'success') icon = '✓';
  else if (kind === 'error' || kind === 'warning') icon = <AlertTriangle size={16} />;
  return (
    <div className={`cr-banner cr-banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="cr-banner-icon">{icon}</span>
      <p className="cr-banner-text">{children}</p>
      {action}
    </div>
  );
}

export default function ChapterReviewPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId');
  const { t } = useTranslation('upload');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  // Book title for the breadcrumb only; the review data itself carries none.
  const { data: book } = useBook(bookId);

  const [phase, setPhase] = useState<Phase>('reviewing');
  const [failure, setFailure] = useState<Failure>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [chapters, setChapters] = useState<ReviewChapter[]>([]);
  const [selCi, setSelCi] = useState(0);
  const [flashCi, setFlashCi] = useState<number | null>(null);
  const [spineOpen, setSpineOpen] = useState(true);
  // 逐章 is the default and the spine never switches on its own (B′).
  const [spineMode, setSpineMode] = useState<SpineMode>('chapter');
  const [ovAvail, setOvAvail] = useState(0);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiNote, setAiNote] = useState<Note>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [selSplit, setSelSplit] = useState<SelSplit | null>(null);
  // TOC cross-check (#22d): AI-parsed book-declared chapter list, shown read-only
  // in a right drawer for the user to eyeball against the detected spine.
  const [tocStatus, setTocStatus] = useState<TocStatus>('idle');
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  // Chapters snapshot taken just before an in-paragraph split, for one-step
  // undo. Cleared by any other structure/role mutation so undo can't silently
  // discard later edits.
  const [undoChapters, setUndoChapters] = useState<ReviewChapter[] | null>(null);

  // Original paragraph roles, captured at load, so submit can derive the
  // sparse roleOverrides map (paragraphIndex → role) for changed paragraphs.
  const originalRolesRef = useRef<Record<number, string>>({});
  const readRef = useRef<HTMLDivElement>(null);
  const ovObserver = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!bookId) return;
    let alive = true;
    fetchReviewData(bookId)
      .then((data) => {
        if (!alive) return;
        const rec: Record<number, string> = {};
        for (const ch of data.chapters) {
          for (const p of ch.paragraphs) rec[p.paragraphIndex] = p.role ?? 'body';
        }
        originalRolesRef.current = rec;
        setChapters(reindex(data.chapters));
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const code = conflictCode(err);
        if (code) setConflict(code);
        else setFailure({ op: 'load', err });
      });
    return () => {
      alive = false;
    };
  }, [bookId, reloadKey]);

  // The overview fits the whole book into whatever height the spine has, so it
  // tracks that height (callback ref: attaches/detaches with the overview list).
  const ovRef = useCallback((el: HTMLDivElement | null) => {
    ovObserver.current?.disconnect();
    ovObserver.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setOvAvail(Math.floor(entry.contentRect.height)));
    ro.observe(el);
    ovObserver.current = ro;
  }, []);

  // ── Structure mutations ──────────────────────────────────────────────────
  const splitAt = useCallback((ci: number, pi: number) => {
    setUndoChapters(null);
    setChapters((prev) => {
      const ch = prev[ci];
      if (!ch || pi <= 0 || pi >= ch.paragraphs.length) return prev;
      const tail = ch.paragraphs.slice(pi);
      const head = { ...ch, paragraphs: ch.paragraphs.slice(0, pi) };
      const first = tail[0];
      const title =
        first.titleSpan ? first.text.slice(first.titleSpan[0], first.titleSpan[1]).trim() || null : null;
      // Inherit the source chapter's role: splitting a non-body block (e.g. a
      // fused front-matter chapter) should yield non-body chapters, not body.
      const added: ReviewChapter = { chapterIdx: ci + 1, title, role: ch.role ?? 'body', paragraphs: tail };
      return reindex([...prev.slice(0, ci), head, added, ...prev.slice(ci + 1)]);
    });
    setSelCi(ci + 1);
  }, []);

  const mergeIntoPrev = useCallback((ci: number) => {
    setUndoChapters(null);
    setChapters((prev) => {
      if (ci <= 0 || ci >= prev.length) return prev;
      const merged = { ...prev[ci - 1], paragraphs: [...prev[ci - 1].paragraphs, ...prev[ci].paragraphs] };
      return reindex([...prev.slice(0, ci - 1), merged, ...prev.slice(ci + 1)]);
    });
    setSelCi(Math.max(0, ci - 1));
  }, []);

  const mergeIntoNext = useCallback((ci: number) => {
    setUndoChapters(null);
    setChapters((prev) => {
      if (ci < 0 || ci >= prev.length - 1) return prev;
      const merged = { ...prev[ci + 1], paragraphs: [...prev[ci].paragraphs, ...prev[ci + 1].paragraphs] };
      return reindex([...prev.slice(0, ci), merged, ...prev.slice(ci + 2)]);
    });
    setSelCi(ci);
  }, []);

  const setChapterRole = useCallback((ci: number, role: string) => {
    setUndoChapters(null);
    setChapters((prev) => prev.map((c, i) => (i === ci ? { ...c, role } : c)));
  }, []);

  const setChapterTitle = useCallback((ci: number, title: string) => {
    setUndoChapters(null);
    setChapters((prev) => prev.map((c, i) => (i === ci ? { ...c, title } : c)));
  }, []);

  const setParaRole = useCallback((ci: number, pi: number, role: string) => {
    setUndoChapters(null);
    setChapters((prev) =>
      prev.map((c, i) =>
        i === ci ? { ...c, paragraphs: c.paragraphs.map((p, j) => (j === pi ? { ...p, role } : p)) } : c,
      ),
    );
  }, []);

  // ── Jump-to-chapter (scroll + transient highlight) ───────────────────────
  const jumpTo = useCallback((ci: number) => {
    setSelCi(ci);
    setFlashCi(ci);
    requestAnimationFrame(() => {
      const sc = readRef.current;
      const el = sc?.querySelector<HTMLElement>(`[data-chapter-anchor="${ci}"]`);
      if (sc && el) sc.scrollTop = el.offsetTop - 6;
    });
    setTimeout(() => setFlashCi((f) => (f === ci ? null : f)), 1300);
  }, []);

  // ── AI boundary assist (#22c) ────────────────────────────────────────────
  const runAI = useCallback(async () => {
    if (!bookId || aiStatus !== 'idle') return;
    setAiStatus('loading');
    setAiNote(null);
    try {
      const b: SuggestRolesResponse = await suggestRoles(bookId);
      const found = (b.frontMatterEnd != null ? 1 : 0) + (b.backMatterStart != null ? 1 : 0);
      if (found === 0) {
        setAiStatus('idle');
        setAiNote({ text: t('review.suggestNone'), kind: 'info' });
        return;
      }
      setUndoChapters(null);
      setChapters((prev) => reindex(applyBoundaries(prev, b)));
      setAiStatus('done');
    } catch (err) {
      setAiStatus('idle');
      // 409 on any review endpoint = the window closed under us (same state as load/submit).
      const code = conflictCode(err);
      if (code) {
        setConflict(code);
        return;
      }
      setAiNote(
        isLlmUnconfigured(err)
          ? { text: tc('failure.llmUnconfigured'), kind: 'warning', settings: true }
          : { text: t('review.suggestError'), kind: 'error' },
      );
    }
  }, [bookId, aiStatus, t, tc]);

  // ── TOC cross-check (#22d) ───────────────────────────────────────────────
  // The *currently edited* TOC text: paragraphs of every chapter the reviewer
  // has marked `toc`, joined. Drives both the parse request and — by comparing
  // against parsedTocText — whether the entry button needs to re-parse.
  const tocText = useMemo(
    () =>
      chapters
        .filter((c) => (c.role ?? 'body') === 'toc')
        .flatMap((c) => c.paragraphs.map((p) => p.text))
        .join('\n')
        .trim(),
    [chapters],
  );
  const hasToc = useMemo(() => chapters.some((c) => (c.role ?? 'body') === 'toc'), [chapters]);
  // The tocText that produced the current tocEntries. Null until first parsed;
  // stale once the reviewer edits the TOC (tocText !== parsedTocText), which is
  // what flips the entry button back to "re-parse".
  const [parsedTocText, setParsedTocText] = useState<string | null>(null);
  // True when the current TOC text has already been parsed: the entry button
  // then just reopens the drawer (no LLM). Editing the TOC makes this false.
  const tocViewMode = parsedTocText !== null && parsedTocText === tocText;

  const runTocParse = useCallback(async () => {
    if (!bookId) return;
    setTocOpen(true);
    setTocStatus('loading');
    // Send the currently edited text so re-parsing reflects live edits rather
    // than the stale detected TOC the backend has on disk.
    try {
      const res = await parseToc(bookId, tocText);
      const entries = res.entries ?? [];
      setTocEntries(entries);
      setTocStatus(entries.length > 0 ? 'done' : 'empty');
      setParsedTocText(tocText); // only on a completed parse, never on error
    } catch (err) {
      const code = conflictCode(err);
      if (code) {
        setConflict(code);
        return;
      }
      setTocStatus(isLlmUnconfigured(err) ? 'unconfigured' : 'error');
    }
  }, [bookId, tocText]);

  // Entry button in "view" mode: reopen the drawer showing the cached parse
  // without hitting the LLM. The drawer's 重新解析 stays the force-reparse path.
  const openTocDrawer = useCallback(() => setTocOpen(true), []);

  // ── In-paragraph split (selection → new paragraph) ───────────────────────
  const handleSelectionEnd = useCallback(() => {
    // Defer one frame so the browser has finalized the selection.
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelSplit(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const owner = (n: Node): HTMLElement | null =>
        (n instanceof HTMLElement ? n : n.parentElement)?.closest('[data-para-ci]') ?? null;
      // Anchor on the paragraph where the selection starts; fall back to the
      // end one so drags that begin on a divider still resolve.
      const el = owner(range.startContainer) ?? owner(range.endContainer);
      if (!el) {
        setSelSplit(null);
        return;
      }
      // Clamp the selection to that paragraph instead of rejecting: drags
      // routinely overshoot past the last character into the next block, and
      // browsers then report the end container outside the paragraph element.
      const content = document.createRange();
      content.selectNodeContents(el);
      const clamped = range.cloneRange();
      if (clamped.compareBoundaryPoints(Range.START_TO_START, content) < 0) {
        clamped.setStart(content.startContainer, content.startOffset);
      }
      if (clamped.compareBoundaryPoints(Range.END_TO_END, content) > 0) {
        clamped.setEnd(content.endContainer, content.endOffset);
      }
      if (clamped.collapsed) {
        setSelSplit(null);
        return;
      }
      const ci = Number(el.dataset.paraCi);
      const pi = Number(el.dataset.paraPi);
      // Char offset of the selection inside the piece's full text: measure the
      // text length of a range spanning from the element start to the selection
      // start (robust across the title/body span structure).
      const pre = document.createRange();
      pre.selectNodeContents(el);
      pre.setEnd(clamped.startContainer, clamped.startOffset);
      const start = pre.toString().length;
      const end = start + clamped.toString().length;
      const p = chapters[ci]?.paragraphs[pi];
      if (!p || !normalizeSplitOffsets(p, start, end)) {
        setSelSplit(null);
        return;
      }
      const r = clamped.getBoundingClientRect();
      setSelSplit({
        ci,
        pi,
        start,
        end,
        x: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90),
        y: Math.min(r.bottom + 8, window.innerHeight - 44),
      });
    });
  }, [chapters]);

  // Listen on document, not the reading column: a drag that ends outside the
  // column (spine, toolbar, beyond the window edge) still finalizes there.
  useEffect(() => {
    document.addEventListener('mouseup', handleSelectionEnd);
    return () => document.removeEventListener('mouseup', handleSelectionEnd);
  }, [handleSelectionEnd]);

  const handleSplitSelection = useCallback(() => {
    if (!selSplit) return;
    const next = splitPiece(chapters, selSplit.ci, selSplit.pi, selSplit.start, selSplit.end);
    setSelSplit(null);
    window.getSelection()?.removeAllRanges();
    if (!next) return;
    setUndoChapters(chapters);
    setChapters(reindex(next));
  }, [selSplit, chapters]);

  const handleUndoSplit = useCallback(() => {
    if (!undoChapters) return;
    setChapters(undoChapters);
    setUndoChapters(null);
  }, [undoChapters]);

  // ── Submit / discard ─────────────────────────────────────────────────────
  const uploadPath = taskId ? `/upload#${taskId}` : '/upload';

  const handleSubmit = useCallback(async () => {
    if (!bookId) return;
    setFailure(null);
    setPhase('submitting');
    setSelSplit(null);
    setUndoChapters(null);
    try {
      const { chapters: payload, roleOverrides, paragraphSplits } = buildSubmitPayload(
        chapters,
        originalRolesRef.current,
      );
      await submitReview(bookId, payload, roleOverrides, paragraphSplits);
      setSubmitted(true);
      setTimeout(() => navigate(uploadPath), 600);
    } catch (err) {
      setPhase('reviewing');
      const code = conflictCode(err);
      if (code) setConflict(code);
      else setFailure({ op: 'submit', err });
    }
  }, [bookId, chapters, navigate, uploadPath]);

  const handleConfirmDiscard = useCallback(async () => {
    if (!bookId) return;
    setPhase('cancelling');
    try {
      await deleteBook(bookId);
      if (taskId) {
        try {
          const saved = sessionStorage.getItem('upload-tasks');
          if (saved) {
            const all = JSON.parse(saved) as { taskId: string }[];
            const filtered = all.filter((x) => x.taskId !== taskId);
            if (filtered.length === 0) sessionStorage.removeItem('upload-tasks');
            else sessionStorage.setItem('upload-tasks', JSON.stringify(filtered));
          }
          const completed = sessionStorage.getItem('upload-completed-tasks');
          if (completed) {
            const ids = new Set(JSON.parse(completed) as string[]);
            ids.delete(taskId);
            sessionStorage.setItem('upload-completed-tasks', JSON.stringify([...ids]));
          }
        } catch {
          // ignore storage errors
        }
      }
    } finally {
      navigate('/upload');
    }
  }, [bookId, taskId, navigate]);

  const retryFailure = useCallback(() => {
    if (failure?.op === 'submit') {
      void handleSubmit();
      return;
    }
    setFailure(null);
    setReloadKey((k) => k + 1);
  }, [failure, handleSubmit]);

  // ── Derived view ─────────────────────────────────────────────────────────
  const view = useMemo(() => {
    let bodyCount = 0;
    const rows = chapters.map((ch, ci) => {
      const isBody = (ch.role ?? 'body') === 'body';
      let displayNo: number | null = null;
      if (isBody) {
        bodyCount += 1;
        displayNo = bodyCount;
      }
      const flagged = isMisSplit(ch);
      const headLabel = isBody
        ? t('review.chapterLabel', { n: displayNo })
        : t(`review.chapterType.${ch.role ?? 'body'}`);
      // Overview label: the body chapter's running number, or the role name.
      const shortLabel = isBody ? String(displayNo) : t(`review.chapterType.${ch.role ?? 'body'}`);
      return { ch, ci, isBody, flagged, headLabel, shortLabel, paraCount: ch.paragraphs.length };
    });
    const totalParas = chapters.reduce((a, c) => a + c.paragraphs.length, 0);
    return { rows, bodyCount, nonBodyCount: chapters.length - bodyCount, totalParas };
  }, [chapters, t]);

  const ovHeights = useMemo(
    () => overviewHeights(view.rows.map((r) => r.paraCount), ovAvail),
    [view.rows, ovAvail],
  );

  // Count comparison: book-declared body chapters (from the parsed TOC) vs the
  // chapters actually detected. delta > 0 = suspected under-split (merged), < 0 =
  // over-split. Only body entries count — non-body TOC lines (序/跋) are excluded.
  const tocCompare = useMemo(() => {
    const tocBody = tocEntries.filter((e) => e.isBody).length;
    const detected = view.bodyCount;
    return { tocBody, detected, delta: tocBody - detected, match: tocBody === detected };
  }, [tocEntries, view.bodyCount]);

  // Pre-number the parsed entries: body entries get a running index, non-body
  // (序/跋/…) entries get no number (they carry a "非正文" tag instead).
  const tocRows = useMemo(() => {
    let n = 0;
    return tocEntries.map((e) => {
      if (e.isBody) n += 1;
      return { ...e, label: e.isBody ? String(n).padStart(2, '0') : '—' };
    });
  }, [tocEntries]);

  const banner = useMemo((): Note => {
    if (submitted) return { text: t('review.submitBanner'), kind: 'success' };
    if (aiStatus === 'loading') return { text: t('review.aiScanBanner'), kind: 'info' };
    if (aiStatus === 'done') return { text: t('review.aiDoneBanner'), kind: 'success' };
    return aiNote;
  }, [submitted, aiStatus, aiNote, t]);

  // ── Render ───────────────────────────────────────────────────────────────
  const crumb = (
    <div className="ss-booknav">
      <Link to="/upload" className="ss-booknav-back">
        <ArrowLeft size={12} />
        {t('title')}
      </Link>
      {book?.title && (
        <>
          <span className="cr-crumb-sep" aria-hidden="true">/</span>
          <span className="ss-booknav-title">{book.title}</span>
        </>
      )}
      <span className="cr-crumb-sep" aria-hidden="true">/</span>
      <span className="ss-booknav-view" aria-current="page">{t('review.crumb')}</span>
    </div>
  );

  // 409: a normal answer — the review window is closed. No retry (H frame).
  if (conflict) {
    const ok = conflict === 'review_submitted';
    let copy = 'notOpen';
    if (ok) copy = 'submitted';
    else if (conflict === 'review_closed') copy = 'closed';
    return (
      <div className="cr-root">
        {crumb}
        <div className="cr-main">
          <div className="ss-state ss-state-stage" role="status">
            <span className={ok ? 'ss-state-icon cr-conflict-icon-ok' : 'ss-state-icon'}>
              {ok ? <CircleCheck size={26} /> : <Info size={26} />}
            </span>
            <h4 className="ss-state-title">{t(`review.conflict.${copy}Title`)}</h4>
            <p className="ss-state-text">{t(`review.conflict.${copy}Body`)}</p>
            <div className="ss-state-actions">
              <button type="button" className="ss-btn ss-btn-sm ss-btn-primary" onClick={() => navigate(uploadPath)}>
                {t('review.conflict.gotoUpload')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (failure) {
    return (
      <div className="cr-root">
        {crumb}
        <div className="cr-main">
          <PageFailure
            variant={failureKind(failure.err)}
            pageName={t('review.crumb')}
            title={failure.op === 'submit' ? t('review.errorSubmit') : undefined}
            onRetry={retryFailure}
            techDetail={techDetailOf(failure.err)}
          />
        </div>
      </div>
    );
  }

  const busy = phase === 'submitting' || phase === 'cancelling';
  const llmLink = (
    <Link to={LLM_SETTINGS_PATH} className="cr-banner-link">
      {tc('failure.llmSettings')}
    </Link>
  );

  return (
    <div className="cr-root">
      {crumb}

      <div className="cr-main">
        {/* Title + actions */}
        <div className="cr-head">
          <div className="cr-head-text">
            <h2 className="cr-title">{t('review.title')}</h2>
            <span className="cr-sub">{t('review.subtitle')}</span>
          </div>
          <div className="cr-head-actions">
            {/* Only when some chapter is marked 目錄. Glyph only on the state
                that calls the LLM; the cached state just reopens the drawer. */}
            {hasToc && (
              <Tooltip label={t('review.toc.detectedHint')}>
                <button
                  type="button"
                  className={`ss-btn ss-btn-sm ss-btn-secondary${tocViewMode ? '' : ' ss-btn-llm'}`}
                  disabled={tocStatus === 'loading'}
                  onClick={tocViewMode ? openTocDrawer : runTocParse}
                >
                  {t(tocViewMode ? 'review.toc.viewBtn' : 'review.toc.readBtn')}
                </button>
              </Tooltip>
            )}
            {/* Three states carried by the button itself; one-shot. */}
            <button
              type="button"
              className={`ss-btn ss-btn-sm ss-btn-secondary${aiStatus === 'idle' ? ' ss-btn-llm' : ''}`}
              disabled={aiStatus !== 'idle' || busy}
              onClick={runAI}
            >
              {aiStatus === 'loading' && <Loader2 size={14} className="cr-spin" />}
              {t(AI_LABEL_KEY[aiStatus])}
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-ghost"
              disabled={busy}
              onClick={() => setConfirmDiscard(true)}
            >
              {t('review.discard')}
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-primary"
              disabled={busy || chapters.length === 0}
              onClick={handleSubmit}
            >
              {phase === 'submitting' && <Loader2 size={14} className="cr-spin" />}
              {phase === 'submitting' ? t('review.submitting') : t('review.submit')}
            </button>
          </div>
        </div>

        {banner && (
          <Banner kind={banner.kind}>
            {banner.text}
            {banner.settings && <>{'\u3000'}{llmLink}</>}
          </Banner>
        )}

        {/* One-step undo for the last in-paragraph split */}
        {undoChapters && !busy && (
          <Banner
            kind="info"
            action={
              <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={handleUndoSplit}>
                {t('review.splitUndo')}
              </button>
            }
          >
            {t('review.splitBanner')}
          </Banner>
        )}

        {/* Discard, second step: only this row actually deletes */}
        {confirmDiscard && (
          <div className="cr-banner cr-banner-error cr-confirm" role="alert">
            <span className="cr-banner-icon">
              <AlertTriangle size={16} />
            </span>
            <p className="cr-banner-text">{t('review.discardConfirm')}</p>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-danger"
              disabled={busy}
              onClick={handleConfirmDiscard}
            >
              {phase === 'cancelling' && <Loader2 size={14} className="cr-spin" />}
              {t('review.discardConfirmBtn')}
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-ghost"
              disabled={busy}
              onClick={() => setConfirmDiscard(false)}
            >
              {tc('cancel')}
            </button>
          </div>
        )}

        {/* Body: spine + reading flow (+ TOC drawer overlay) */}
        <div className="cr-body">
          <aside className={spineOpen ? 'cr-spine' : 'cr-spine is-collapsed'}>
            {spineOpen ? (
              <>
                <div className="cr-spine-head">
                  <span className="cr-spine-name">{t('review.spineTitle')}</span>
                  <div className="cr-spine-tools">
                    <div className="ss-seg" role="group">
                      {(['chapter', 'overview'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={spineMode === m ? 'ss-seg-item active' : 'ss-seg-item'}
                          aria-pressed={spineMode === m}
                          onClick={() => setSpineMode(m)}
                        >
                          {t(m === 'chapter' ? 'review.spineModeChapter' : 'review.spineModeOverview')}
                        </button>
                      ))}
                    </div>
                    <Tooltip label={t('review.spineToggle')}>
                      <button
                        type="button"
                        className="cr-spine-toggle"
                        aria-label={t('review.spineToggle')}
                        onClick={() => setSpineOpen(false)}
                      >
                        <PanelLeft size={16} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <p className="cr-spine-summary">
                  {t('review.spineSummary', {
                    total: view.totalParas,
                    body: view.bodyCount,
                    nonBody: view.nonBodyCount,
                  })}
                </p>

                {spineMode === 'chapter' ? (
                  <div className="cr-spine-list">
                    {view.rows.map(({ ch, ci, isBody, flagged, headLabel, paraCount }) => (
                      <button
                        key={ci}
                        type="button"
                        className={[
                          'cr-block',
                          isBody ? '' : 'is-nonbody',
                          selCi === ci ? 'is-selected' : '',
                        ].filter(Boolean).join(' ')}
                        style={{ minHeight: spineBlockHeight(paraCount) }}
                        onClick={() => jumpTo(ci)}
                      >
                        <span className="cr-block-head">
                          <span className={isBody ? 'cr-mark' : 'cr-mark is-nonbody'} />
                          <span className="cr-block-label">{headLabel}</span>
                          {flagged && (
                            <Tooltip label={t('review.flagMisSplit')} anchorClassName="cr-flag-anchor">
                              <span className="cr-flag" />
                            </Tooltip>
                          )}
                        </span>
                        {ch.title && <span className="cr-block-title">{ch.title}</span>}
                        <span className="cr-block-count">{t('review.paraCount', { n: paraCount })}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="cr-ov" ref={ovRef}>
                    {view.rows.map(({ ch, ci, isBody, flagged, headLabel, shortLabel, paraCount }) => {
                      const h = ovHeights[ci] ?? 2;
                      const tip = [headLabel, ch.title, t('review.paraCount', { n: paraCount })]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <Tooltip key={ci} label={tip} anchorClassName="cr-ov-anchor" anchorStyle={{ height: h }}>
                        <button
                          type="button"
                          className="cr-ov-row"
                          aria-label={tip}
                          onClick={() => jumpTo(ci)}
                        >
                          <span className="cr-ov-label">{h >= OVERVIEW_LABEL_MIN ? shortLabel : ''}</span>
                          <span
                            className={[
                              'cr-ov-bar',
                              isBody ? '' : 'is-nonbody',
                              selCi === ci ? 'is-selected' : '',
                            ].filter(Boolean).join(' ')}
                          />
                          <span className={flagged ? 'cr-ov-flag is-flagged' : 'cr-ov-flag'} />
                        </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <Tooltip label={t('review.spineToggle')}>
                  <button
                    type="button"
                    className="cr-spine-toggle"
                    aria-label={t('review.spineToggle')}
                    onClick={() => setSpineOpen(true)}
                  >
                    <PanelLeft size={16} />
                  </button>
                </Tooltip>
                <Tooltip label={t('review.railHint')} anchorClassName="cr-rail-anchor">
                <div className="cr-rail">
                  {view.rows.map(({ ci, isBody, flagged, paraCount }) => (
                    <button
                      key={ci}
                      type="button"
                      aria-label={view.rows[ci].headLabel}
                      className={[
                        'cr-rail-bar',
                        isBody ? '' : 'is-nonbody',
                        flagged ? 'is-flagged' : '',
                        selCi === ci ? 'is-selected' : '',
                      ].filter(Boolean).join(' ')}
                      style={{ height: railBarHeight(paraCount) }}
                      onClick={() => jumpTo(ci)}
                    />
                  ))}
                </div>
                </Tooltip>
              </>
            )}
          </aside>

          {/* Reading flow */}
          <div className="cr-read-col">
            {/* Info row + on-demand role guide (an overlay, so it never pushes
                the reading flow down) */}
            <div className="cr-inforow">
              <p className="cr-info-text">{t('review.infoRow')}</p>
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary"
                aria-expanded={glossaryOpen}
                onClick={() => setGlossaryOpen((g) => !g)}
              >
                {t('review.glossaryTag')}
              </button>

              {glossaryOpen && (
                <div className="cr-guide" role="dialog" aria-label={t('review.glossaryToggle')}>
                  <div className="cr-guide-head">
                    <h3 className="cr-guide-title">{t('review.glossaryToggle')}</h3>
                    <Tooltip label={t('review.toc.close')}>
                      <button
                        type="button"
                        className="cr-icon-btn"
                        aria-label={t('review.toc.close')}
                        onClick={() => setGlossaryOpen(false)}
                      >
                        <X size={16} />
                      </button>
                    </Tooltip>
                  </div>
                  <p className="cr-guide-intro">{t('review.glossaryIntro')}</p>
                  <div className="cr-guide-grid">
                    <div className="cr-guide-col">
                      <div className="cr-guide-col-head is-chapter">{t('review.glossaryChHead')}</div>
                      {CHAPTER_ROLES.map((r) => (
                        <div className="cr-guide-item" key={r}>
                          <span className={r === 'body' ? 'cr-role-pill is-solid' : 'cr-role-pill is-soft'}>
                            {t(`review.chapterType.${r}`)}
                          </span>
                          <span className="cr-guide-desc">{t(`review.chDesc.${r}`)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="cr-guide-col">
                      <div className="cr-guide-col-head">{t('review.glossaryPaHead')}</div>
                      {PARA_ROLES.map((r) => (
                        <div className="cr-guide-item" key={r}>
                          <span className={r === 'body' ? 'cr-role-pill is-accent' : 'cr-role-pill is-line'}>
                            {t(`review.paraType.${r}`)}
                          </span>
                          <span className="cr-guide-desc">{t(`review.paDesc.${r}`)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="cr-read" ref={readRef} onScroll={() => setSelSplit((s) => (s ? null : s))}>
              {view.rows.map(({ ch, ci, isBody, headLabel }) => (
                <div key={ci} className="cr-chapter" data-chapter-anchor={ci}>
                  <div
                    className={[
                      'cr-divider',
                      isBody ? '' : 'is-nonbody',
                      selCi === ci ? 'is-selected' : '',
                      ci === flashCi ? 'is-flash' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="ss-badge cr-ch-badge">{t('review.chapterBadge')}</span>
                    <span className="cr-ch-no">{headLabel}</span>
                    <input
                      className="cr-ch-title"
                      value={ch.title ?? ''}
                      placeholder={t('review.chapterTitlePlaceholder')}
                      onChange={(e) => setChapterTitle(ci, e.target.value)}
                    />
                    <select
                      className="cr-select cr-ch-role"
                      value={ch.role ?? 'body'}
                      onChange={(e) => setChapterRole(ci, e.target.value)}
                    >
                      {CHAPTER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`review.chapterType.${r}`)}
                        </option>
                      ))}
                    </select>
                    <Tooltip label={t('review.mergePrevTitle')}>
                      <button
                        type="button"
                        className="ss-btn ss-btn-sm ss-btn-ghost"
                        disabled={ci === 0}
                        onClick={() => mergeIntoPrev(ci)}
                      >
                        {t('review.mergePrev')}
                      </button>
                    </Tooltip>
                    <Tooltip label={t('review.mergeNextTitle')}>
                      <button
                        type="button"
                        className="ss-btn ss-btn-sm ss-btn-ghost"
                        disabled={ci === chapters.length - 1}
                        onClick={() => mergeIntoNext(ci)}
                      >
                        {t('review.mergeNext')}
                      </button>
                    </Tooltip>
                  </div>

                  {ch.paragraphs.map((p, pi) => {
                    // A non-body chapter is excluded wholesale, so its paragraphs
                    // dim too (02 B), not only paragraphs tagged non-body.
                    const pIsBody = isBody && (p.role ?? 'body') === 'body';
                    const titlePart = p.titleSpan ? p.text.slice(p.titleSpan[0], p.titleSpan[1]) : null;
                    const bodyPart = p.titleSpan ? p.text.slice(p.titleSpan[1]) : p.text;
                    return (
                      <div className={pIsBody ? 'cr-para' : 'cr-para is-nonbody'} key={pieceKey(p)}>
                        <Tooltip label={t('review.splitHere')}>
                          <button
                            type="button"
                            className={pi > 0 ? 'cr-split' : 'cr-split is-first'}
                            aria-label={t('review.splitHere')}
                            tabIndex={pi > 0 ? undefined : -1}
                            disabled={pi === 0}
                            onClick={() => splitAt(ci, pi)}
                          >
                            ＋
                          </button>
                        </Tooltip>
                        <p className="cr-para-text" data-para-ci={ci} data-para-pi={pi}>
                          {titlePart && <span className="cr-para-lead">{titlePart}</span>}
                          {bodyPart}
                        </p>
                        <select
                          className="cr-select cr-para-role"
                          value={p.role ?? 'body'}
                          onChange={(e) => setParaRole(ci, pi, e.target.value)}
                        >
                          {PARA_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t('review.paraTag')}
                              {t(`review.paraType.${r}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* TOC cross-check drawer (#22d): AI-parsed book contents, read-only.
              It overlays the right edge without reflowing the reading flow; the
              two lists (this + the spine) are deliberately never paired. */}
          {tocOpen && (
            <aside className="cr-toc">
              <div className="cr-toc-head">
                <div className="cr-toc-head-title">
                  <span className="cr-toc-title">{t('review.toc.drawerTitle')}</span>
                  <span className="ss-badge cr-ch-badge">{t('review.toc.drawerBadge')}</span>
                </div>
                <div className="cr-toc-tools">
                  {tocStatus !== 'unconfigured' && (
                    <button
                      type="button"
                      className="ss-btn ss-btn-sm ss-btn-ghost ss-btn-llm"
                      disabled={tocStatus === 'loading'}
                      onClick={runTocParse}
                    >
                      {t('review.toc.reparse')}
                    </button>
                  )}
                  <Tooltip label={t('review.toc.close')}>
                    <button
                      type="button"
                      className="cr-icon-btn"
                      aria-label={t('review.toc.close')}
                      onClick={() => setTocOpen(false)}
                    >
                      <X size={15} />
                    </button>
                  </Tooltip>
                </div>
              </div>

              <div className="cr-toc-body">
                {tocStatus === 'loading' && (
                  <div className="cr-toc-loading">
                    <Loader2 size={16} className="cr-spin" />
                    {t('review.toc.loading')}
                  </div>
                )}

                {(tocStatus === 'empty' || tocStatus === 'error') && (
                  <div className="cr-toc-state">
                    <p className={tocStatus === 'error' ? 'cr-toc-msg is-error' : 'cr-toc-msg'}>
                      {t(tocStatus === 'empty' ? 'review.toc.empty' : 'review.toc.error')}
                    </p>
                    <button
                      type="button"
                      className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                      onClick={runTocParse}
                    >
                      {t('review.toc.reparse')}
                    </button>
                  </div>
                )}

                {/* 503 (app JSON): a feature state inside the drawer only; no
                    re-parse — it would fail the same way until configured. */}
                {tocStatus === 'unconfigured' && (
                  <div className="cr-toc-state">
                    <p className="cr-toc-msg is-plain">{tc('failure.llmUnconfigured')}</p>
                    {llmLink}
                  </div>
                )}

                {tocStatus === 'done' && (
                  <>
                    <div className="cr-toc-label">{t('review.toc.compareLabel')}</div>
                    <div className={tocCompare.match ? 'cr-toc-summary is-match' : 'cr-toc-summary'}>
                      <span className="cr-toc-glyph">{tocCompare.match ? '✓' : '!'}</span>
                      <span className="cr-toc-summary-text">
                        {t(tocCompare.match ? 'review.toc.summaryMatch' : 'review.toc.summaryMismatch', {
                          toc: tocCompare.tocBody,
                          detected: tocCompare.detected,
                        })}
                      </span>
                      {!tocCompare.match && (
                        <span className="cr-toc-delta">
                          {tocCompare.delta > 0
                            ? t('review.toc.deltaUnder', { n: tocCompare.delta })
                            : t('review.toc.deltaOver', { n: -tocCompare.delta })}
                        </span>
                      )}
                    </div>

                    <div className="cr-toc-list">
                      {tocRows.map((e) => (
                        <div
                          className={e.isBody ? 'cr-toc-entry' : 'cr-toc-entry is-nonbody'}
                          key={`${e.level}:${e.title}:${e.page ?? ''}`}
                          style={{ paddingLeft: `calc(${e.level} * var(--space-6))` }}
                        >
                          <span className="cr-toc-no">{e.label}</span>
                          <span className="cr-toc-entry-title">
                            {e.title}
                            {!e.isBody && <> <span className="cr-toc-notbody">{t('review.toc.notBody')}</span></>}
                          </span>
                          {e.page != null && <span className="cr-toc-page">p.{e.page}</span>}
                        </div>
                      ))}
                    </div>

                    <p className="cr-toc-note">{t('review.toc.note')}</p>
                  </>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Floating action for a validated in-paragraph selection. Lives outside
          .cr-read so clicking it doesn't retrigger the selection handler;
          mousedown is swallowed so the selection survives until onClick. */}
      {selSplit && phase === 'reviewing' && !submitted && (
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-primary cr-splitsel"
          style={{ left: selSplit.x, top: selSplit.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSplitSelection}
        >
          {t('review.splitSelection')}
        </button>
      )}
    </div>
  );
}
