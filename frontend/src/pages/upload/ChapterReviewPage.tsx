import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Loader2 } from 'lucide-react';
import { fetchReviewData, fetchTaskStatus, submitReview } from '@/api/ingest';
import type { ReviewChapter, ReviewSubmitChapter } from '@/api/types';

type Phase = 'reviewing' | 'submitting' | 'pipeline_running' | 'done' | 'error';

export default function ChapterReviewPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId');
  const { t } = useTranslation('upload');

  const [phase, setPhase] = useState<Phase>('reviewing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ReviewChapter[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [doneBookId, setDoneBookId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load review data on mount
  useEffect(() => {
    if (!bookId) return;
    fetchReviewData(bookId)
      .then((data) => setChapters(data.chapters))
      .catch(() => {
        setPhase('error');
        setErrorMsg(t('review.errorLoad'));
      });
  }, [bookId, t]);

  // Poll task status while pipeline_running
  useEffect(() => {
    if (phase !== 'pipeline_running' || !taskId) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchTaskStatus(taskId);
        if (status.status === 'done' && status.result?.bookId) {
          clearInterval(pollRef.current!);
          setDoneBookId(String(status.result.bookId));
          setPhase('done');
        } else if (status.status === 'error') {
          clearInterval(pollRef.current!);
          setPhase('error');
          setErrorMsg(status.error ?? '分析失敗');
        }
      } catch {
        // transient — keep polling
      }
    }, 2000);
    return () => clearInterval(pollRef.current!);
  }, [phase, taskId]);

  const handleSubmit = useCallback(async () => {
    if (!bookId) return;
    setPhase('submitting');
    try {
      const payload: ReviewSubmitChapter[] = chapters.map((ch) => ({
        title: ch.title ?? '',
        startParagraphIndex: ch.paragraphs[0]?.paragraphIndex ?? 0,
      }));
      await submitReview(bookId, payload);
      setPhase('pipeline_running');
    } catch {
      setPhase('error');
      setErrorMsg(t('review.errorSubmit'));
    }
  }, [bookId, chapters, t]);

  const handleChapterTitleChange = useCallback((idx: number, value: string) => {
    setChapters((prev) =>
      prev.map((ch, i) => (i === idx ? { ...ch, title: value } : ch)),
    );
  }, []);

  const handleSplitBefore = useCallback((chapterIdx: number, paragraphIndex: number) => {
    setChapters((prev) => {
      const ch = prev[chapterIdx];
      const splitAt = ch.paragraphs.findIndex((p) => p.paragraphIndex === paragraphIndex);
      if (splitAt <= 0) return prev;
      const before = { ...ch, paragraphs: ch.paragraphs.slice(0, splitAt), chapterIdx: chapterIdx };
      const after: ReviewChapter = {
        chapterIdx: chapterIdx + 1,
        title: null,
        paragraphs: ch.paragraphs.slice(splitAt),
      };
      const next = [...prev.slice(0, chapterIdx), before, after, ...prev.slice(chapterIdx + 1)];
      return next.map((c, i) => ({ ...c, chapterIdx: i }));
    });
  }, []);

  const handleDeleteChapter = useCallback((chapterIdx: number) => {
    setChapters((prev) => {
      if (prev.length <= 1) return prev;
      const removed = prev[chapterIdx];
      const target = chapterIdx > 0 ? chapterIdx - 1 : 0;
      const merged = prev.map((ch, i) => {
        if (i !== target) return ch;
        return {
          ...ch,
          paragraphs:
            chapterIdx === 0
              ? [...removed.paragraphs, ...ch.paragraphs]
              : [...ch.paragraphs, ...removed.paragraphs],
        };
      });
      const filtered = merged.filter((_, i) => i !== chapterIdx);
      return filtered.map((c, i) => ({ ...c, chapterIdx: i }));
    });
    setSelectedIdx((prev) => Math.max(0, prev - (chapterIdx <= prev ? 1 : 0)));
  }, []);

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <CheckCircle size={40} style={{ color: 'var(--color-success)' }} />
        <p className="text-base font-medium" style={{ color: 'var(--fg-primary)' }}>
          {t('review.done')}
        </p>
        {doneBookId && (
          <Link
            to={`/books/${doneBookId}`}
            className="text-sm font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {t('review.goToBook', { title: doneBookId })}
          </Link>
        )}
      </div>
    );
  }

  if (phase === 'pipeline_running') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>
          {t('review.pipelineRunning')}
        </p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {errorMsg ?? '發生錯誤'}
        </p>
        <Link to="/upload" className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          ← 返回上傳頁
        </Link>
      </div>
    );
  }

  const selectedChapter = chapters[selectedIdx];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: chapter list */}
      <aside
        className="flex flex-col w-56 shrink-0 overflow-y-auto border-r"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--fg-secondary)' }}>
            {t('review.title')}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
            {chapters.length} 章
          </p>
        </div>
        <ul className="flex-1 py-2">
          {chapters.map((ch, i) => (
            <li key={i}>
              <button
                className="w-full text-left px-4 py-2 text-xs"
                style={{
                  backgroundColor: i === selectedIdx ? 'var(--entity-con-bg)' : 'transparent',
                  color: i === selectedIdx ? 'var(--entity-con-fg)' : 'var(--fg-secondary)',
                  fontWeight: i === selectedIdx ? 600 : 400,
                }}
                onClick={() => setSelectedIdx(i)}
              >
                {t('review.chapterLabel', { n: i + 1 })}
                {ch.title ? (
                  <span className="block truncate" style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>
                    {ch.title}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            className="w-full text-xs px-3 py-2 rounded-md font-medium flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--accent)', color: 'white', border: 'none' }}
            disabled={phase === 'submitting' || chapters.length === 0}
            onClick={handleSubmit}
          >
            {phase === 'submitting' && <Loader2 size={11} className="animate-spin" />}
            {phase === 'submitting' ? t('review.submitting') : t('review.submit')}
          </button>
        </div>
      </aside>

      {/* Right: paragraph cards */}
      <main className="flex-1 overflow-y-auto p-6">
        {selectedChapter && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-xs font-semibold" style={{ color: 'var(--fg-muted)' }}>
                {t('review.chapterLabel', { n: selectedIdx + 1 })}
              </span>
              <input
                className="flex-1 max-w-xs px-2 py-1 text-sm rounded-md"
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--fg-primary)',
                }}
                placeholder={t('review.noTitle')}
                value={selectedChapter.title ?? ''}
                onChange={(e) => handleChapterTitleChange(selectedIdx, e.target.value)}
              />
              {chapters.length > 1 && (
                <button
                  className="text-xs px-2 py-1 rounded-md"
                  style={{ color: 'var(--color-error)', border: '1px solid var(--color-error)' }}
                  onClick={() => handleDeleteChapter(selectedIdx)}
                >
                  {t('review.deleteChapter')}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {selectedChapter.paragraphs.map((para, pIdx) => {
                const isTitle = para.titleSpan !== null;
                const titleText = isTitle ? para.text.slice(0, para.titleSpan![1]) : null;
                const bodyText = isTitle ? para.text.slice(para.titleSpan![1]).trimStart() : para.text;
                return (
                  <div key={para.paragraphIndex}>
                    {pIdx > 0 && (
                      <button
                        className="w-full text-xs py-0.5 mb-1 opacity-0 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--entity-con-fg)', borderTop: '1px dashed var(--entity-con-border)' }}
                        onClick={() => handleSplitBefore(selectedIdx, para.paragraphIndex)}
                      >
                        {t('review.addChapterBefore')}
                      </button>
                    )}
                    <div
                      className="p-3 rounded-md"
                      style={{
                        border: `1px solid ${isTitle ? 'var(--entity-con-border)' : 'var(--border)'}`,
                        backgroundColor: isTitle ? 'var(--entity-con-bg)' : 'var(--bg-secondary)',
                      }}
                    >
                      {isTitle && (
                        <p
                          className="text-xs font-semibold mb-1"
                          style={{ color: 'var(--entity-con-fg)' }}
                        >
                          {titleText}
                        </p>
                      )}
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
                        {bodyText}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
