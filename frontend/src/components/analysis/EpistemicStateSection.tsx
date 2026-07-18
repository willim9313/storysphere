import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, AlertTriangle, Clock, Users, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { useSourceJump } from '@/hooks/useSourceJump';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { ChapterTimeline, type TimelineMarker } from './ChapterTimeline';
import { getChapter, getTitle, getDescription, getId } from './epistemicEventUtils';

interface EpistemicStateSectionProps {
  bookId: string;
  characterId: string;
  totalChapters: number;
  // #10: opens the page-level epistemic-compare drawer, seeded with this
  // section's current (optimistic) cursor position so the drawer starts in
  // sync with what the user was just looking at.
  onOpenCompare: (currentChapter: number) => void;
}

const DEBOUNCE_MS = 200;

export function EpistemicStateSection({
  bookId,
  characterId,
  totalChapters,
  onOpenCompare,
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
  const { jump, pendingKey } = useSourceJump(bookId);

  // Backend already partitions events into known/unknown by the character's
  // epistemic access (participant OR public visibility → known; otherwise →
  // unknown) and only returns events with chapter ≤ up_to_chapter. We surface
  // those buckets directly here. The local filter narrows further to
  // displayedChapter so the panels feel responsive while the debounced query
  // is in-flight — important when dragging the slider backwards.
  const optimistic = useMemo(() => {
    if (!state) return null;
    // Misbeliefs (MisbeliefItemSchema) carry no chapter field, so this
    // predicate keeps them visible — same "no chapter → don't filter out"
    // rule applied to known/unknown events, kept consistent across all
    // three columns.
    const isVisibleByChapter = (ev: unknown): boolean => {
      const ch = getChapter(ev as Record<string, unknown>);
      return ch == null || ch <= displayedChapter;
    };
    const filterByChapter = (events: Record<string, unknown>[]) =>
      events.filter(isVisibleByChapter);
    return {
      known: filterByChapter(state.knownEvents as Record<string, unknown>[]),
      unknown: filterByChapter(state.unknownEvents as Record<string, unknown>[]),
      misbeliefs: state.misbeliefs.filter(isVisibleByChapter),
    };
  }, [state, displayedChapter]);

  // Only markers with chapter <= displayedChapter render on the axis — same
  // optimistic-filter rule as the known/unknown/misbelief panes above, so the
  // timeline doesn't flash markers ahead of the cursor while dragging.
  const markers: TimelineMarker[] = useMemo(() => {
    if (!state) return [];
    const all: TimelineMarker[] = [];
    (state.knownEvents as Record<string, unknown>[]).forEach((ev, i) => {
      const ch = getChapter(ev);
      if (ch == null || ch > displayedChapter) return;
      all.push({
        id: getId(ev, i),
        chapter: ch,
        category: 'known',
        title: getTitle(ev),
      });
    });
    (state.unknownEvents as Record<string, unknown>[]).forEach((ev, i) => {
      const ch = getChapter(ev);
      if (ch == null || ch > displayedChapter) return;
      all.push({
        id: getId(ev, i + 10000),
        chapter: ch,
        category: 'unknown',
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
        <div className="ca-epi-summary-chapter">
          <span className="ca-epi-summary-chapter-label">{t('character.epistemic.upToChapter')}</span>
          <span className="ca-epi-summary-chapter-n">
            {t('character.epistemic.chapterN', { n: displayedChapter })}
          </span>
        </div>
        <div className="ca-epi-counts">
          <div className="ca-epi-count">
            <span className="ca-epi-count-dot known" />
            <span className="ca-epi-count-n">{optimistic?.known.length ?? 0}</span>
            <span className="ca-epi-count-l">{t('character.epistemic.knownLabel')}</span>
          </div>
          <div className="ca-epi-count">
            <span className="ca-epi-count-dot unknown" />
            <span className="ca-epi-count-n">{optimistic?.unknown.length ?? 0}</span>
            <span className="ca-epi-count-l">{t('character.epistemic.unknownLabel')}</span>
          </div>
          <div className="ca-epi-count">
            <span className="ca-epi-count-dot misbelief" />
            <span className="ca-epi-count-n">{optimistic?.misbeliefs.length ?? 0}</span>
            <span className="ca-epi-count-l">{t('character.epistemic.misbeliefShortLabel')}</span>
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
          {isFetching ? t('character.epistemic.computing') : t('character.epistemic.summarySubtitle')}
        </span>
        <button
          type="button"
          className="ca-btn ca-btn-outline-accent"
          onClick={() => onOpenCompare(displayedChapter)}
        >
          <Users size={13} /> {t('character.epistemicCompare.openButton')}
        </button>
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
              <span className="ca-epi-block-count">{optimistic.known.length}</span>
            </div>
            {optimistic.known.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
                {t('character.epistemic.knownEmpty')}
              </p>
            ) : (
              optimistic.known.map((ev, i) => {
                const ch = getChapter(ev);
                const key = getId(ev, i);
                return (
                  <EpistemicEventRow
                    key={key}
                    title={getTitle(ev)}
                    chapter={ch}
                    pending={pendingKey === key}
                    onJump={
                      ch == null
                        ? undefined
                        : () => void jump(key, `${getTitle(ev)}。${getDescription(ev)}`, { chapter: ch })
                    }
                  />
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
              <span className="ca-epi-block-count">{optimistic.unknown.length}</span>
            </div>
            {optimistic.unknown.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
                {t('character.epistemic.unknownEmpty')}
              </p>
            ) : (
              optimistic.unknown.map((ev, i) => {
                const ch = getChapter(ev);
                const key = getId(ev, i + 10000);
                return (
                  <EpistemicEventRow
                    key={key}
                    title={getTitle(ev)}
                    chapter={ch}
                    unknown
                    pending={pendingKey === key}
                    onJump={
                      ch == null
                        ? undefined
                        : () => void jump(key, `${getTitle(ev)}。${getDescription(ev)}`, { chapter: ch })
                    }
                  />
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
              <span className="ca-epi-block-count">{optimistic.misbeliefs.length}</span>
            </div>
            {optimistic.misbeliefs.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
                {t('character.epistemic.misbeliefEmpty')}
              </p>
            ) : (
              optimistic.misbeliefs.map((m) => (
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

/** #4: a known/unknown event row, clickable when its chapter is known — jumps
 * to the reader passage via #22a semantic search (same-chapter filtered,
 * mirroring the reader's own cognitive-panel lookup). Falls back to a plain
 * (non-interactive) row when `onJump` is omitted, i.e. the event carries no
 * chapter to anchor a lookup to. */
function EpistemicEventRow({
  title,
  chapter,
  unknown,
  pending,
  onJump,
}: Readonly<{
  title: string;
  chapter: number | null;
  unknown?: boolean;
  pending: boolean;
  onJump?: () => void;
}>) {
  const { t } = useTranslation('analysis');
  const rowClass = `ca-epi-event-row${unknown ? ' unknown-row' : ''}${onJump ? ' clickable' : ''}`;

  if (!onJump) {
    return (
      <div className={rowClass}>
        <span className="ca-epi-event-name">{title}</span>
        {chapter != null && <span className="ca-epi-event-ch">Ch.{chapter}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={rowClass}
      onClick={onJump}
      disabled={pending}
      title={t('character.sourceJump.cta')}
    >
      <span className="ca-epi-event-name">{title}</span>
      {pending ? (
        <Loader size={11} className="ca-srcjump-spinner animate-spin" aria-label={t('character.sourceJump.locating')} />
      ) : (
        chapter != null && <span className="ca-epi-event-ch">Ch.{chapter}</span>
      )}
    </button>
  );
}
