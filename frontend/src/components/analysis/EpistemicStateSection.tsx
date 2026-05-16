import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, AlertTriangle, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { ChapterTimeline, type TimelineMarker } from './ChapterTimeline';

interface EpistemicStateSectionProps {
  bookId: string;
  characterId: string;
  totalChapters: number;
}

const DEBOUNCE_MS = 200;

function getChapter(ev: Record<string, unknown>): number | null {
  const v = ev.chapter ?? ev.chapterNumber ?? ev.chapter_number;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getTitle(ev: Record<string, unknown>): string {
  return String(ev.title ?? ev.name ?? ev.event ?? '');
}

function getId(ev: Record<string, unknown>, fallback: number): string {
  return String(ev.id ?? ev.eventId ?? fallback);
}

export function EpistemicStateSection({
  bookId,
  characterId,
  totalChapters,
}: EpistemicStateSectionProps) {
  const { t } = useTranslation('analysis');
  const queryClient = useQueryClient();
  const safeTotal = Math.max(1, totalChapters);

  // displayedChapter follows the cursor instantly; queriedChapter trails behind
  // by DEBOUNCE_MS so we don't fire a request on every slider tick.
  const [displayedChapter, setDisplayedChapter] = useState(safeTotal);
  const [queriedChapter, setQueriedChapter] = useState(safeTotal);

  // Reset cursor when the character changes. Using the "store previous prop"
  // pattern (https://react.dev/reference/react/useState#resetting-state-with-a-key)
  // avoids a cascading-render lint error from setState inside useEffect.
  const [trackedCharacterId, setTrackedCharacterId] = useState(characterId);
  if (trackedCharacterId !== characterId) {
    setTrackedCharacterId(characterId);
    setDisplayedChapter(safeTotal);
    setQueriedChapter(safeTotal);
  }

  useEffect(() => {
    if (displayedChapter === queriedChapter) return;
    const tid = setTimeout(() => setQueriedChapter(displayedChapter), DEBOUNCE_MS);
    return () => clearTimeout(tid);
  }, [displayedChapter, queriedChapter]);

  const { data: state, isFetching } = useEpistemicState(bookId, characterId, queriedChapter);

  // Optimistic filtering — while debouncing, derive visible/unknown events
  // from the most recent payload using the displayed cursor position.
  const optimistic = useMemo(() => {
    if (!state) return null;
    const allKnown = state.knownEvents as Record<string, unknown>[];
    const allUnknown = state.unknownEvents as Record<string, unknown>[];

    // Union of both lists; partition by displayedChapter.
    const merged = [...allKnown, ...allUnknown];
    const visible: Record<string, unknown>[] = [];
    const future: Record<string, unknown>[] = [];
    for (const ev of merged) {
      const ch = getChapter(ev);
      if (ch == null || ch <= displayedChapter) visible.push(ev);
      else future.push(ev);
    }
    return { visible, future };
  }, [state, displayedChapter]);

  const markers: TimelineMarker[] = useMemo(() => {
    if (!state) return [];
    const all: TimelineMarker[] = [];
    (state.knownEvents as Record<string, unknown>[]).forEach((ev, i) => {
      const ch = getChapter(ev);
      if (ch == null) return;
      all.push({
        id: getId(ev, i),
        chapter: ch,
        category: ch <= displayedChapter ? 'known' : 'unknown',
        title: getTitle(ev),
      });
    });
    (state.unknownEvents as Record<string, unknown>[]).forEach((ev, i) => {
      const ch = getChapter(ev);
      if (ch == null) return;
      all.push({
        id: getId(ev, i + 10000),
        chapter: ch,
        category: ch <= displayedChapter ? 'known' : 'unknown',
        title: getTitle(ev),
      });
    });
    return all;
  }, [state, displayedChapter]);

  if (state && !state.dataComplete) {
    return (
      <div className="ca-empty">
        <div className="ca-empty-icon">
          <Clock size={22} />
        </div>
        <div className="ca-empty-title">{t('character.epistemic.noVisibilityData')}</div>
        <ClassifyVisibilityButton
          bookId={bookId}
          onComplete={() =>
            queryClient.invalidateQueries({
              queryKey: ['books', bookId, 'epistemic-state'],
            })
          }
        />
      </div>
    );
  }

  return (
    <div>
      {/* Summary row */}
      <div className="ca-epi-summary">
        <div className="ca-epi-counts">
          <div className="ca-epi-count">
            <span className="ca-epi-count-dot known" />
            <span className="ca-epi-count-n">{optimistic?.visible.length ?? 0}</span>
            <span className="ca-epi-count-l">{t('character.epistemic.knownLabel')}</span>
          </div>
          <div className="ca-epi-count">
            <span className="ca-epi-count-dot unknown" />
            <span className="ca-epi-count-n">{optimistic?.future.length ?? 0}</span>
            <span className="ca-epi-count-l">{t('character.epistemic.unknownLabel')}</span>
          </div>
          <div className="ca-epi-count">
            <span className="ca-epi-count-dot misbelief" />
            <span className="ca-epi-count-n">{state?.misbeliefs.length ?? 0}</span>
            <span className="ca-epi-count-l">{t('character.epistemic.misbeliefShortLabel')}</span>
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          {isFetching ? t('character.epistemic.computing') : t('character.epistemic.summarySubtitle')}
        </span>
      </div>

      <ChapterTimeline
        chapter={displayedChapter}
        totalChapters={safeTotal}
        markers={markers}
        onChange={setDisplayedChapter}
      />

      {state && optimistic && (
        <div className="ca-epi-pane-columns">
          {/* Known */}
          <div className="ca-epi-block known">
            <div className="ca-epi-block-head">
              <span className="ca-epi-block-title">
                <Eye size={12} />
                {t('character.epistemic.knownTitle')}
              </span>
              <span className="ca-epi-block-count">{optimistic.visible.length}</span>
            </div>
            {optimistic.visible.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>
                {t('character.epistemic.knownEmpty')}
              </p>
            ) : (
              optimistic.visible.map((ev, i) => {
                const ch = getChapter(ev);
                return (
                  <div key={getId(ev, i)} className="ca-epi-event-row">
                    <span className="ca-epi-event-name">{getTitle(ev)}</span>
                    {ch != null && <span className="ca-epi-event-ch">Ch.{ch}</span>}
                  </div>
                );
              })
            )}
          </div>

          {/* Unknown */}
          <div className="ca-epi-block unknown">
            <div className="ca-epi-block-head">
              <span className="ca-epi-block-title">
                <EyeOff size={12} />
                {t('character.epistemic.unknownTitle')}
              </span>
              <span className="ca-epi-block-count">{optimistic.future.length}</span>
            </div>
            {optimistic.future.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>
                {t('character.epistemic.unknownEmpty')}
              </p>
            ) : (
              optimistic.future.map((ev, i) => {
                const ch = getChapter(ev);
                return (
                  <div key={getId(ev, i + 10000)} className="ca-epi-event-row unknown-row">
                    <span className="ca-epi-event-name">{getTitle(ev)}</span>
                    {ch != null && (
                      <span className="ca-epi-event-ch">
                        {t('character.epistemic.unknownRevealAt', { n: ch })}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Misbeliefs */}
          <div className="ca-epi-block misbelief">
            <div className="ca-epi-block-head">
              <span className="ca-epi-block-title">
                <AlertTriangle size={12} />
                {t('character.epistemic.misbeliefTitle')}
              </span>
              <span className="ca-epi-block-count">{state.misbeliefs.length}</span>
            </div>
            {state.misbeliefs.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-muted)' }}>
                {t('character.epistemic.misbeliefEmpty')}
              </p>
            ) : (
              state.misbeliefs.map((m) => (
                <div key={m.sourceEventId} className="ca-misbelief">
                  <div>
                    <span className="label">{t('character.epistemic.characterBelieves')}</span>
                    <span className="belief">{m.characterBelief}</span>
                  </div>
                  <div className="truth-row">
                    <span className="label">{t('character.epistemic.actually')}</span>
                    {m.actualTruth}
                  </div>
                  <div className="meta-row">
                    {t('character.epistemic.confidence', { pct: Math.round(m.confidence * 100) })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
