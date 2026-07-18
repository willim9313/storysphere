import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastContext';
import { findBestPassage } from '@/lib/passageLookup';

export interface SourceJumpOptions {
  /** Restrict the lookup to a single chapter (epistemic events, whose only
   * known anchor is a chapter number). Omit for a whole-book best match
   * (persona evidence / relation & voice quotes — #2). */
  chapter?: number;
}

/**
 * Shared "click cited/quoted text -> jump to its paragraph in the reader"
 * affordance for the character analysis page (#2 persona evidence & quotes,
 * #4 epistemic events). Mirrors the reader's own cognitive-panel lookup
 * (`EpistemicSidePanel`, #22a) via the shared `findBestPassage` util so both
 * surfaces stay behaviorally identical: same query construction, same
 * single-lookup-at-a-time guard.
 *
 * One difference from the in-reader panel: that panel's "no exact passage,
 * but we know the chapter" fallback just flips `viewingChapterId` locally,
 * because it's already inside ReaderPage. This hook instead navigates across
 * routes to `/books/:bookId`, and ReaderPage's location.state deep-link
 * contract only acts when `paragraphId` is present (see the jump effects in
 * ReaderPage.tsx) — a bare `{ chapterNumber }` state is a silent no-op there.
 * So instead of a no-op navigate, a chapter-scoped miss retries once with a
 * wider net (topK 30) before giving up and surfacing a toast.
 */
export function useSourceJump(bookId: string | undefined) {
  const navigate = useNavigate();
  const { push } = useToast();
  const { t } = useTranslation('analysis');
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const jump = useCallback(
    async (key: string, text: string, opts?: SourceJumpOptions): Promise<boolean> => {
      // Same "one lookup in flight, silently ignore the rest" guard as
      // EpistemicSidePanel.handleEventJump.
      if (!bookId || pendingKey) return false;
      setPendingKey(key);
      try {
        const chapter = opts?.chapter ?? null;
        let best = await findBestPassage(text, bookId, chapter);
        if (!best && chapter != null) {
          best = await findBestPassage(text, bookId, chapter, 30);
        }
        if (best?.id) {
          navigate(`/books/${bookId}`, {
            state: {
              paragraphId: best.id,
              chapterNumber: best.metadata?.chapterNumber ?? chapter,
            },
          });
          return true;
        }
        push({
          type: 'info',
          title:
            chapter != null
              ? t('character.sourceJump.notFoundInChapter', { chapter })
              : t('character.sourceJump.notFound'),
        });
        return false;
      } catch {
        push({ type: 'error', title: t('character.sourceJump.failed') });
        return false;
      } finally {
        setPendingKey(null);
      }
    },
    [bookId, pendingKey, navigate, push, t],
  );

  return { jump, pendingKey };
}
