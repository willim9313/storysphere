import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, ChevronRight, List, Loader2, RotateCw, Sparkles, X } from 'lucide-react';
import { fetchReviewData, parseToc, submitReview, suggestRoles } from '@/api/ingest';
import type { SuggestRolesResponse, TocEntry } from '@/api/ingest';
import { deleteBook } from '@/api/books';
import type { ReviewChapter } from '@/api/types';
import { applyBoundaries } from './applyBoundaries';
import { buildSubmitPayload, normalizeSplitOffsets, pieceKey, splitPiece } from './paragraphSplits';

const CHAPTER_ROLES = ['body', 'toc', 'preface', 'afterword', 'other'] as const;
const PARA_ROLES = ['body', 'separator', 'section', 'epigraph', 'preamble'] as const;

type Phase = 'reviewing' | 'submitting' | 'cancelling' | 'error';
/** A validated in-paragraph text selection, plus where to float the split button. */
type SelSplit = { ci: number; pi: number; start: number; end: number; x: number; y: number };
type AiStatus = 'idle' | 'loading' | 'done';
type TocStatus = 'idle' | 'loading' | 'done' | 'empty' | 'error';
type NoteKind = 'info' | 'success' | 'error';
type Note = { text: string; kind: NoteKind } | null;

const BANNER_COLORS: Record<NoteKind, { bg: string; fg: string }> = {
  error: { bg: 'var(--color-error-bg)', fg: 'var(--color-error)' },
  success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
  info: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
};
const AI_LABEL_KEY: Record<AiStatus, string> = {
  idle: 'review.suggestRoles',
  loading: 'review.suggesting',
  done: 'review.suggestDone',
};

/** Re-index chapters so chapterIdx matches array position after a mutation. */
function reindex(chapters: ReviewChapter[]): ReviewChapter[] {
  return chapters.map((c, i) => ({ ...c, chapterIdx: i }));
}

function spineBlockBg(isBody: boolean, selected: boolean): string {
  if (selected) return 'var(--entity-con-bg)';
  return isBody ? 'var(--bg-primary)' : 'var(--bg-tertiary)';
}

function railBg(isBody: boolean, flagged: boolean): string {
  if (flagged) return 'var(--color-warning)';
  return isBody ? 'var(--accent)' : 'var(--border)';
}

export default function ChapterReviewPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId');
  const { t } = useTranslation('upload');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('reviewing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ReviewChapter[]>([]);
  const [selCi, setSelCi] = useState(0);
  const [flashCi, setFlashCi] = useState<number | null>(null);
  const [spineOpen, setSpineOpen] = useState(true);
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

  useEffect(() => {
    if (!bookId) return;
    fetchReviewData(bookId)
      .then((data) => {
        const rec: Record<number, string> = {};
        for (const ch of data.chapters) {
          for (const p of ch.paragraphs) rec[p.paragraphIndex] = p.role ?? 'body';
        }
        originalRolesRef.current = rec;
        setChapters(reindex(data.chapters));
      })
      .catch(() => {
        setPhase('error');
        setErrorMsg(t('review.errorLoad'));
      });
  }, [bookId, t]);

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
    } catch {
      setAiStatus('idle');
      setAiNote({ text: t('review.suggestError'), kind: 'error' });
    }
  }, [bookId, aiStatus, t]);

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
    } catch {
      setTocStatus('error');
    }
  }, [bookId, tocText]);

  // Entry button in "view" mode: reopen the drawer showing the cached parse
  // without hitting the LLM. The drawer's ↻ stays the force-reparse path.
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
  const handleSubmit = useCallback(async () => {
    if (!bookId) return;
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
      setTimeout(() => navigate(taskId ? `/upload#${taskId}` : '/upload'), 600);
    } catch {
      setPhase('error');
      setErrorMsg(t('review.errorSubmit'));
    }
  }, [bookId, chapters, t, navigate, taskId]);

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
      const titleCount = ch.paragraphs.filter((p) => p.titleSpan).length;
      const flagged = isBody && titleCount > 1;
      const headLabel = isBody
        ? t('review.chapterLabel', { n: displayNo })
        : t(`review.chapterType.${ch.role ?? 'body'}`);
      return { ch, ci, isBody, flagged, headLabel, paraCount: ch.paragraphs.length };
    });
    const totalParas = chapters.reduce((a, c) => a + c.paragraphs.length, 0);
    return { rows, bodyCount, nonBodyCount: chapters.length - bodyCount, totalParas };
  }, [chapters, t]);

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
      return { ...e, label: e.isBody ? String(n) : '' };
    });
  }, [tocEntries]);

  const banner = useMemo((): Note => {
    if (submitted) return { text: t('review.submitBanner'), kind: 'success' };
    if (aiStatus === 'loading') return { text: t('review.aiScanBanner'), kind: 'info' };
    if (aiStatus === 'done') return { text: t('review.aiDoneBanner'), kind: 'success' };
    return aiNote;
  }, [submitted, aiStatus, aiNote, t]);

  if (phase === 'error') {
    return (
      <div className="cr-error">
        <p style={{ color: 'var(--color-error)', font: '600 13px var(--font-sans)' }}>{errorMsg ?? tc('error')}</p>
        <button className="cr-link" onClick={() => navigate('/upload')}>
          ← {t('title')}
        </button>
      </div>
    );
  }

  const busy = phase === 'submitting' || phase === 'cancelling';
  const bannerColor = BANNER_COLORS[banner?.kind ?? 'info'];
  const aiIcon = {
    idle: <Sparkles size={13} />,
    loading: <Loader2 size={13} className="cr-spin" />,
    done: <Check size={13} />,
  }[aiStatus];

  return (
    <div className="cr-root">
      <style>{CR_STYLES}</style>

      {/* Toolbar */}
      <div className="cr-toolbar">
        <div className="cr-toolbar-title">
          <span className="cr-book-title">{t('review.title')}</span>
          <span className="cr-book-sub">{t('review.subtitle')}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="cr-btn cr-btn-ghost" disabled={aiStatus !== 'idle' || busy} onClick={runAI}>
          {aiIcon}
          {t(AI_LABEL_KEY[aiStatus])}
        </button>
        <button className="cr-btn cr-btn-discard" disabled={busy} onClick={() => setConfirmDiscard(true)}>
          {t('review.discard')}
        </button>
        <button className="cr-btn cr-btn-submit" disabled={busy || chapters.length === 0} onClick={handleSubmit}>
          {phase === 'submitting' && <Loader2 size={12} className="cr-spin" />}
          {phase === 'submitting' ? t('review.submitting') : t('review.submit')}
        </button>
      </div>

      {/* Banner */}
      {banner && (
        <div className="cr-banner" style={{ background: bannerColor.bg, color: bannerColor.fg }}>
          {banner.text}
        </div>
      )}

      {/* Undo bar for the last in-paragraph split */}
      {undoChapters && !busy && (
        <div className="cr-banner" style={{ background: BANNER_COLORS.info.bg, color: BANNER_COLORS.info.fg }}>
          <span>{t('review.splitBanner')}</span>
          <button className="cr-undo-split" onClick={handleUndoSplit}>
            {t('review.splitUndo')}
          </button>
        </div>
      )}

      {/* Discard confirmation */}
      {confirmDiscard && (
        <div className="cr-confirm">
          <span style={{ font: '600 12px var(--font-sans)', color: 'var(--color-error)' }}>
            {t('review.discardConfirm')}
          </span>
          <div style={{ flex: 1 }} />
          <button className="cr-confirm-yes" disabled={busy} onClick={handleConfirmDiscard}>
            {phase === 'cancelling' ? <Loader2 size={11} className="cr-spin" /> : null}
            {t('review.discardConfirmBtn')}
          </button>
          <button className="cr-confirm-no" disabled={busy} onClick={() => setConfirmDiscard(false)}>
            {tc('cancel')}
          </button>
        </div>
      )}

      {/* Body: spine + reading column */}
      <div className="cr-body">
        <aside className="cr-spine" style={{ width: spineOpen ? 206 : 40 }}>
          <button className="cr-spine-toggle" title={t('review.spineToggle')} onClick={() => setSpineOpen((s) => !s)}>
            {spineOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          {spineOpen ? (
            <>
              <div className="cr-spine-head">{t('review.spineTitle')}</div>
              <div className="cr-spine-summary">
                {t('review.spineSummary', {
                  total: view.totalParas,
                  body: view.bodyCount,
                  nonBody: view.nonBodyCount,
                })}
              </div>
              {view.rows.map(({ ch, ci, isBody, flagged, headLabel, paraCount }) => (
                <button
                  key={ci}
                  className="cr-spine-block"
                  onClick={() => jumpTo(ci)}
                  style={{
                    minHeight: 30 + paraCount * 15,
                    borderLeft: `4px solid ${isBody ? 'var(--accent)' : 'var(--fg-muted)'}`,
                    background: spineBlockBg(isBody, selCi === ci),
                  }}
                >
                  <span className="cr-spine-label">
                    {headLabel}
                    {flagged && <span className="cr-flag-dot" title={t('review.flagMisSplit')} />}
                  </span>
                  {ch.title && <span className="cr-spine-title">{ch.title}</span>}
                  <span className="cr-spine-count">{t('review.paraCount', { n: paraCount })}</span>
                </button>
              ))}
            </>
          ) : (
            <div title={t('review.railHint')}>
              {view.rows.map(({ ci, isBody, flagged, paraCount }) => (
                <button
                  key={ci}
                  className="cr-rail"
                  onClick={() => jumpTo(ci)}
                  style={{
                    minHeight: 14 + paraCount * 8,
                    background: railBg(isBody, flagged),
                    outline: selCi === ci ? '2px solid var(--fg-primary)' : undefined,
                    outlineOffset: selCi === ci ? 1 : undefined,
                  }}
                />
              ))}
            </div>
          )}
        </aside>

        {/* Reading column */}
        <div
          className="cr-read"
          ref={readRef}
          onScroll={() => setSelSplit((s) => (s ? null : s))}
        >
          <div className="cr-read-inner">
            {/* Info row + on-demand role guide (opens as an overlay, so it
                never pushes the reading flow down) */}
            <div className="cr-inforow">
              <span className="cr-info-text">{t('review.infoRow')}</span>
              <button
                className="cr-guide-trigger"
                aria-expanded={glossaryOpen}
                onClick={() => setGlossaryOpen((g) => !g)}
              >
                {t('review.glossaryTag')}
                <span className="cr-chevron">{glossaryOpen ? '▾' : '▸'}</span>
              </button>
            </div>

            {glossaryOpen && (
              <div className="cr-guide-pop">
                <div className="cr-guide-pop-head">
                  <span className="cr-guide-pop-title">{t('review.glossaryToggle')}</span>
                  <button className="cr-guide-close" title={tc('cancel')} onClick={() => setGlossaryOpen(false)}>
                    ✕
                  </button>
                </div>
                <p className="cr-glossary-intro">{t('review.glossaryIntro')}</p>
                <div className="cr-glossary-grid">
                  <div>
                    <div className="cr-glossary-col-head cr-ch">
                      <span className="cr-swatch" style={{ background: 'var(--accent)' }} />
                      {t('review.glossaryChHead')}
                    </div>
                    {CHAPTER_ROLES.map((r) => (
                      <div className="cr-glossary-item" key={r}>
                        <span className={`cr-tag ${r === 'body' ? 'cr-tag-ch-body' : 'cr-tag-ch'}`}>
                          {t(`review.chapterType.${r}`)}
                        </span>
                        <span className="cr-glossary-desc">{t(`review.chDesc.${r}`)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="cr-glossary-col-head cr-pa">
                      <span className="cr-swatch" style={{ background: 'var(--entity-char-dot)' }} />
                      {t('review.glossaryPaHead')}
                    </div>
                    {PARA_ROLES.map((r) => (
                      <div className="cr-glossary-item" key={r}>
                        <span className={`cr-tag ${r === 'body' ? 'cr-tag-pa-body' : 'cr-tag-pa'}`}>
                          {t(`review.paraType.${r}`)}
                        </span>
                        <span className="cr-glossary-desc">{t(`review.paDesc.${r}`)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Chapters */}
            {view.rows.map(({ ch, ci, headLabel }) => (
              <div key={ci} data-chapter-anchor={ci} style={{ scrollMarginTop: 8 }}>
                <div
                  className="cr-divider"
                  style={{ background: ci === flashCi ? 'var(--color-warning-bg)' : 'transparent' }}
                >
                  <div className="cr-hair" style={{ background: selCi === ci ? 'var(--accent)' : 'var(--border)' }} />
                  <div className="cr-divider-cluster">
                    <span className="cr-ch-badge">{t('review.chapterBadge')}</span>
                    <span className="cr-ch-no">{headLabel}</span>
                    <input
                      className="cr-ch-title"
                      value={ch.title ?? ''}
                      placeholder={t('review.chapterTitlePlaceholder')}
                      onChange={(e) => setChapterTitle(ci, e.target.value)}
                    />
                    <select
                      className="cr-ch-role"
                      value={ch.role ?? 'body'}
                      onChange={(e) => setChapterRole(ci, e.target.value)}
                    >
                      {CHAPTER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`review.chapterType.${r}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="cr-merge"
                      disabled={ci === 0}
                      title={t('review.mergePrevTitle')}
                      onClick={() => mergeIntoPrev(ci)}
                    >
                      {t('review.mergePrev')}
                    </button>
                    <button
                      className="cr-merge"
                      disabled={ci === chapters.length - 1}
                      title={t('review.mergeNextTitle')}
                      onClick={() => mergeIntoNext(ci)}
                    >
                      {t('review.mergeNext')}
                    </button>
                  </div>
                  <div className="cr-hair" style={{ background: selCi === ci ? 'var(--accent)' : 'var(--border)' }} />
                </div>

                {(ch.role ?? 'body') === 'toc' && (
                  <div className="cr-toc-cue">
                    <span className="cr-toc-cue-text">{t('review.toc.detectedHint')}</span>
                    <button
                      className="cr-toc-cue-btn"
                      disabled={tocStatus === 'loading'}
                      onClick={tocViewMode ? openTocDrawer : runTocParse}
                    >
                      {tocViewMode ? <List size={13} /> : <Sparkles size={13} />}
                      {t(tocViewMode ? 'review.toc.viewBtn' : 'review.toc.readBtn')}
                    </button>
                  </div>
                )}

                {ch.paragraphs.map((p, pi) => {
                  const pIsBody = (p.role ?? 'body') === 'body';
                  const titlePart = p.titleSpan ? p.text.slice(p.titleSpan[0], p.titleSpan[1]) : null;
                  const bodyPart = p.titleSpan ? p.text.slice(p.titleSpan[1]) : p.text;
                  return (
                    <div className="cr-para" key={pieceKey(p)} style={{ opacity: pIsBody ? 1 : 0.55 }}>
                      <div className="cr-split-gutter">
                        {pi > 0 && (
                          <button className="cr-split" title={t('review.splitHere')} onClick={() => splitAt(ci, pi)}>
                            ＋
                          </button>
                        )}
                      </div>
                      <div className="cr-para-text" data-para-ci={ci} data-para-pi={pi}>
                        {titlePart && <span style={{ fontWeight: 700 }}>{titlePart}</span>}
                        {bodyPart}
                      </div>
                      <div className="cr-para-role-wrap">
                        <select
                          className="cr-para-role"
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
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* TOC cross-check drawer (#22d): AI-parsed book contents, read-only.
            Sibling of the reading column so it overlays the right edge without
            reflowing it; the two lists (this + the spine) stay unlinked. */}
        {tocOpen && (
          <aside className="cr-toc-drawer">
            <div className="cr-toc-head">
              <span className="cr-toc-title">{t('review.toc.drawerTitle')}</span>
              <span className="cr-toc-badge">{t('review.toc.drawerBadge')}</span>
              <div style={{ flex: 1 }} />
              <button
                className="cr-toc-icon"
                title={t('review.toc.reparse')}
                disabled={tocStatus === 'loading'}
                onClick={runTocParse}
              >
                <RotateCw size={13} />
              </button>
              <button className="cr-toc-icon" title={t('review.toc.close')} onClick={() => setTocOpen(false)}>
                <X size={13} />
              </button>
            </div>

            {tocStatus === 'loading' && (
              <div className="cr-toc-loading">
                <Loader2 size={14} className="cr-spin" />
                {t('review.toc.loading')}
              </div>
            )}

            {(tocStatus === 'empty' || tocStatus === 'error') && (
              <div className="cr-toc-fallback">
                <span>{t(tocStatus === 'empty' ? 'review.toc.empty' : 'review.toc.error')}</span>
                <button className="cr-toc-relink" onClick={runTocParse}>
                  {t('review.toc.reparse')}
                </button>
              </div>
            )}

            {tocStatus === 'done' && (
              <>
                <div
                  className="cr-toc-summary"
                  style={{
                    background: tocCompare.match ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                    color: tocCompare.match ? 'var(--color-success)' : 'var(--color-warning)',
                  }}
                >
                  <div className="cr-toc-summary-top">
                    {tocCompare.match && <Check size={13} />}
                    <span className="cr-toc-summary-label">{t('review.toc.compareLabel')}</span>
                    <div style={{ flex: 1 }} />
                    {!tocCompare.match && (
                      <span
                        className="cr-toc-delta"
                        style={{ background: 'var(--color-warning)', color: '#fff' }}
                      >
                        {tocCompare.delta > 0
                          ? t('review.toc.deltaUnder', { n: tocCompare.delta })
                          : t('review.toc.deltaOver', { n: -tocCompare.delta })}
                      </span>
                    )}
                  </div>
                  <span className="cr-toc-summary-text">
                    {t(tocCompare.match ? 'review.toc.summaryMatch' : 'review.toc.summaryMismatch', {
                      toc: tocCompare.tocBody,
                      detected: tocCompare.detected,
                    })}
                  </span>
                </div>

                <p className="cr-toc-note">{t('review.toc.note')}</p>

                <div className="cr-toc-list">
                  {tocRows.map((e) => (
                    <div
                      className="cr-toc-entry"
                      key={`${e.level}:${e.title}:${e.page ?? ''}`}
                      style={{ paddingLeft: 11 + e.level * 14 }}
                    >
                      <span className="cr-toc-entry-label">{e.label}</span>
                      <span
                        className="cr-toc-entry-title"
                        style={{ color: e.isBody ? 'var(--fg-primary)' : 'var(--fg-muted)' }}
                      >
                        {e.title}
                      </span>
                      {!e.isBody && <span className="cr-toc-entry-tag">{t('review.toc.notBody')}</span>}
                      {e.page != null && <span className="cr-toc-entry-page">p.{e.page}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* Floating action for a validated in-paragraph selection. Lives outside
          .cr-read so clicking it doesn't retrigger the selection handler;
          mousedown is swallowed so the selection survives until onClick. */}
      {selSplit && phase === 'reviewing' && !submitted && (
        <button
          className="cr-splitsel"
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

// Scoped styles. Every color is a design token (var(--*)); the two one-off
// durations (500ms jump-flash, 200ms spine collapse) match the design spec.
const CR_STYLES = `
.cr-root { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--bg-primary); color:var(--fg-primary); font-family:var(--font-sans); overflow:hidden; }
.cr-root :focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
.cr-spin { animation:cr-spin 1s linear infinite; }
@keyframes cr-spin { to { transform:rotate(360deg); } }

.cr-error { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:12px; }
.cr-link { border:none; background:transparent; color:var(--fg-muted); font:12px var(--font-sans); cursor:pointer; }
.cr-link:hover { color:var(--accent); }

.cr-toolbar { flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:9px 12px; border-bottom:1px solid var(--border); background:var(--bg-secondary); }
.cr-toolbar-title { display:flex; flex-direction:column; line-height:1.15; }
.cr-book-title { font:700 13px var(--font-serif); color:var(--fg-primary); }
.cr-book-sub { font:10px var(--font-sans); color:var(--fg-muted); }
.cr-btn { display:inline-flex; align-items:center; gap:6px; border-radius:var(--radius-md); font:600 11px var(--font-sans); cursor:pointer; }
.cr-btn:disabled { opacity:.55; cursor:default; }
.cr-btn-ghost { padding:6px 11px; border:1px solid var(--border); background:var(--bg-primary); color:var(--fg-secondary); }
.cr-btn-ghost:not(:disabled):hover { background:var(--bg-tertiary); }
.cr-btn-discard { padding:6px 11px; border:1px solid var(--border); background:transparent; color:var(--color-error); }
.cr-btn-discard:not(:disabled):hover { background:var(--color-error-bg); }
.cr-btn-submit { padding:6px 14px; border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:700; }
.cr-btn-submit:not(:disabled):hover { opacity:.88; }

.cr-banner { flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:7px 14px; font:600 11.5px var(--font-sans); border-bottom:1px solid var(--border); }
.cr-undo-split { flex:0 0 auto; padding:3px 10px; border:1px solid currentColor; border-radius:var(--radius-sm); background:transparent; color:inherit; font:700 11px var(--font-sans); cursor:pointer; }
.cr-undo-split:hover { background:var(--bg-primary); }
.cr-splitsel { position:fixed; z-index:20; transform:translateX(-50%); padding:6px 12px; border:1px solid var(--accent); border-radius:999px; background:var(--accent); color:#fff; font:700 11.5px var(--font-sans); cursor:pointer; box-shadow:var(--shadow-lg); white-space:nowrap; }
.cr-splitsel:hover { opacity:.88; }
.cr-confirm { flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:8px 14px; background:var(--color-error-bg); border-bottom:1px solid var(--color-error); }
.cr-confirm-yes { display:inline-flex; align-items:center; gap:5px; padding:4px 12px; border:none; border-radius:var(--radius-sm); background:var(--color-error); color:#fff; font:700 11px var(--font-sans); cursor:pointer; }
.cr-confirm-no { padding:4px 12px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-primary); color:var(--fg-secondary); font:600 11px var(--font-sans); cursor:pointer; }
.cr-confirm-yes:disabled, .cr-confirm-no:disabled { opacity:.55; cursor:default; }

.cr-body { flex:1; display:flex; min-height:0; position:relative; }
.cr-spine { flex:0 0 auto; border-right:1px solid var(--border); background:var(--bg-secondary); overflow:auto; padding:8px 7px; transition:width 200ms ease; }
.cr-spine-toggle { width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; padding:4px 2px 8px; border:none; background:transparent; cursor:pointer; color:var(--fg-muted); }
.cr-spine-toggle:hover { color:var(--accent); }
.cr-spine-head { font:600 10.5px var(--font-sans); letter-spacing:.04em; color:var(--fg-muted); padding:2px 4px 4px; }
.cr-spine-summary { font:10px var(--font-sans); color:var(--fg-muted); padding:0 4px 9px; line-height:1.5; }
.cr-spine-block { width:100%; box-sizing:border-box; text-align:left; display:flex; flex-direction:column; justify-content:center; gap:3px; padding:7px 9px; margin-bottom:5px; border:1px solid var(--border); border-radius:6px; cursor:pointer; }
.cr-spine-block:hover { filter:brightness(0.97); }
.cr-spine-label { display:flex; align-items:center; gap:6px; font:700 12px var(--font-sans); color:var(--fg-primary); }
.cr-flag-dot { width:7px; height:7px; border-radius:50%; background:var(--color-warning); }
.cr-spine-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:12px var(--font-serif); color:var(--fg-secondary); }
.cr-spine-count { font:10px var(--font-sans); color:var(--fg-muted); }
.cr-rail { display:block; width:100%; box-sizing:border-box; border:none; padding:0; border-radius:4px; cursor:pointer; margin-bottom:4px; }

.cr-read { flex:1; overflow:auto; position:relative; background:var(--bg-primary); padding:4px 0 60px; }
.cr-read-inner { max-width:960px; margin:0 auto; padding:0 40px; position:relative; }

.cr-inforow { display:flex; align-items:center; gap:8px; padding:10px 2px 4px; border-bottom:1px solid var(--border); margin-bottom:6px; }
.cr-info-text { flex:1; min-width:0; font:11px var(--font-sans); color:var(--fg-muted); }
.cr-guide-trigger { flex:0 0 auto; display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border:1px solid var(--border); border-radius:999px; background:var(--bg-secondary); color:var(--fg-secondary); font:600 11px var(--font-sans); cursor:pointer; white-space:nowrap; }
.cr-guide-trigger:hover { background:var(--bg-tertiary); color:var(--accent); border-color:var(--accent); }
.cr-chevron { font:10px var(--font-sans); color:var(--fg-muted); }

.cr-guide-pop { position:absolute; top:38px; left:40px; right:40px; z-index:6; background:var(--bg-primary); border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); padding:16px; }
.cr-guide-pop-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.cr-guide-pop-title { flex:1; font:700 12.5px var(--font-sans); color:var(--fg-primary); }
.cr-guide-close { flex:0 0 auto; width:22px; height:22px; border:1px solid var(--border); border-radius:var(--radius-sm); background:transparent; color:var(--fg-muted); font:12px var(--font-sans); cursor:pointer; display:flex; align-items:center; justify-content:center; }
.cr-guide-close:hover { background:var(--bg-tertiary); color:var(--fg-primary); }
.cr-glossary-intro { margin:0 0 14px; font:12px/1.6 var(--font-sans); color:var(--fg-secondary); }
.cr-glossary-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.cr-glossary-col-head { font:700 11.5px var(--font-sans); margin-bottom:8px; display:flex; align-items:center; gap:6px; }
.cr-glossary-col-head.cr-ch { color:var(--accent); }
.cr-glossary-col-head.cr-pa { color:var(--entity-char-fg); }
.cr-swatch { width:8px; height:8px; border-radius:2px; }
.cr-glossary-item { display:flex; gap:9px; align-items:baseline; margin-bottom:9px; }
.cr-glossary-desc { font:12px/1.5 var(--font-sans); color:var(--fg-secondary); }
.cr-tag { flex:0 0 auto; min-width:44px; padding:2px 8px; border-radius:5px; font:700 10.5px var(--font-sans); text-align:center; }
.cr-tag-ch-body { background:var(--accent); color:#fff; }
.cr-tag-ch { background:var(--bg-tertiary); color:var(--fg-secondary); border:1px solid var(--border); }
.cr-tag-pa-body { background:var(--entity-char-bg); color:var(--entity-char-fg); border:1px solid var(--entity-char-border); }
.cr-tag-pa { background:var(--bg-primary); color:var(--fg-muted); border:1px solid var(--border); }

.cr-divider { display:flex; align-items:center; gap:10px; margin:24px -8px 14px; padding:4px 8px; border-radius:8px; transition:background-color 500ms ease; }
.cr-hair { height:1px; flex:1; }
.cr-divider-cluster { display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:center; }
.cr-ch-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:5px; font:700 10px var(--font-sans); background:var(--accent); color:#fff; }
.cr-ch-no { font:600 12px var(--font-sans); color:var(--fg-secondary); }
.cr-ch-title { width:140px; padding:4px 8px; border:1px solid var(--accent); border-radius:var(--radius-md); background:var(--bg-primary); color:var(--fg-primary); font:14px var(--font-serif); }
.cr-ch-role { padding:4px 8px; border:1px solid var(--accent); border-radius:var(--radius-md); background:var(--bg-tertiary); color:var(--accent); font:600 11px var(--font-sans); cursor:pointer; }
.cr-merge { padding:4px 8px; border-radius:var(--radius-md); border:1px solid var(--accent); background:transparent; color:var(--accent); font:600 11px var(--font-sans); white-space:nowrap; cursor:pointer; }
.cr-merge:not(:disabled):hover { background:var(--accent); color:#fff; }
.cr-merge:disabled { border-color:var(--border); color:var(--fg-muted); opacity:.4; cursor:not-allowed; }

.cr-para { display:flex; gap:8px; align-items:flex-start; margin:0 0 4px; }
.cr-split-gutter { width:24px; flex:0 0 auto; display:flex; justify-content:center; padding-top:5px; }
.cr-split { width:22px; height:22px; border-radius:50%; border:1px dashed var(--accent); background:var(--bg-secondary); color:var(--accent); font:700 13px var(--font-sans); cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center; }
.cr-split:hover { background:var(--accent); color:#fff; }
.cr-para-text { flex:1; min-width:0; font:16px/1.9 var(--font-serif); color:var(--fg-primary); text-wrap:pretty; }
.cr-para-role-wrap { width:80px; flex:0 0 auto; padding-top:2px; }
.cr-para-role { width:100%; padding:3px 4px; border:1px solid var(--entity-char-border); border-radius:var(--radius-sm); background:var(--bg-primary); color:var(--entity-char-fg); font:500 10.5px var(--font-sans); cursor:pointer; }

/* TOC cross-check (#22d): in-flow cue on a detected toc chapter + right drawer. */
.cr-toc-cue { display:flex; flex-direction:column; align-items:center; gap:5px; margin:0 0 16px; padding:11px 14px; border:1px solid var(--accent); border-radius:var(--radius-md); background:var(--bg-secondary); }
.cr-toc-cue-text { font:11px/1.5 var(--font-sans); color:var(--fg-secondary); text-align:center; }
.cr-toc-cue-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid var(--accent); border-radius:var(--radius-md); background:var(--bg-primary); color:var(--accent); font:600 11px var(--font-sans); cursor:pointer; }
.cr-toc-cue-btn:not(:disabled):hover { background:var(--bg-tertiary); }
.cr-toc-cue-btn:disabled { opacity:.55; cursor:default; }

.cr-toc-drawer { position:absolute; top:0; right:0; bottom:0; width:326px; box-sizing:border-box; background:var(--bg-secondary); border-left:1px solid var(--border); box-shadow:var(--shadow-lg); z-index:5; overflow:auto; padding:14px 15px; }
.cr-toc-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.cr-toc-title { font:700 13px var(--font-serif); color:var(--fg-primary); }
.cr-toc-badge { padding:1px 7px; border-radius:4px; font:600 9.5px var(--font-sans); background:var(--bg-tertiary); color:var(--fg-muted); border:1px solid var(--border); }
.cr-toc-icon { width:24px; height:22px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; padding:0; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg-primary); color:var(--fg-muted); cursor:pointer; }
.cr-toc-icon:not(:disabled):hover { background:var(--bg-tertiary); }
.cr-toc-icon:disabled { opacity:.55; cursor:default; }

.cr-toc-loading { display:flex; align-items:center; gap:8px; padding:12px 2px; color:var(--fg-muted); font:12px var(--font-sans); }
.cr-toc-fallback { display:flex; flex-direction:column; gap:8px; padding:10px 11px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg-primary); font:11px/1.6 var(--font-sans); color:var(--fg-secondary); }
.cr-toc-relink { align-self:flex-start; padding:0; border:none; background:transparent; color:var(--accent); font:600 11px var(--font-sans); cursor:pointer; }
.cr-toc-relink:hover { text-decoration:underline; }

.cr-toc-summary { display:flex; flex-direction:column; gap:6px; margin-bottom:9px; padding:9px 11px; border:1px solid var(--border); border-radius:var(--radius-md); }
.cr-toc-summary-top { display:flex; align-items:center; gap:6px; }
.cr-toc-summary-label { font:700 12px var(--font-sans); }
.cr-toc-delta { padding:2px 10px; border-radius:999px; font:700 11px var(--font-sans); white-space:nowrap; }
.cr-toc-summary-text { font:600 11.5px/1.5 var(--font-sans); }
.cr-toc-note { margin:0 0 9px; font:11px/1.5 var(--font-sans); color:var(--fg-muted); }
.cr-toc-list { border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden; background:var(--bg-primary); }
.cr-toc-entry { display:flex; align-items:baseline; gap:8px; padding:7px 11px; border-bottom:1px solid var(--border); }
.cr-toc-entry:last-child { border-bottom:none; }
.cr-toc-entry-label { flex:0 0 auto; min-width:22px; font:600 11px var(--font-sans); color:var(--fg-muted); }
.cr-toc-entry-title { flex:1; min-width:0; font:13px var(--font-serif); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cr-toc-entry-tag { flex:0 0 auto; padding:1px 6px; border-radius:4px; font:600 9.5px var(--font-sans); background:var(--bg-tertiary); color:var(--fg-muted); border:1px solid var(--border); }
.cr-toc-entry-page { flex:0 0 auto; font:11px var(--font-mono); color:var(--fg-muted); }

@media (prefers-reduced-motion: reduce) {
  .cr-spine, .cr-divider, .cr-spin { transition:none !important; animation:none !important; }
}
`;
