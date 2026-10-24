import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, AlertTriangle, Clock, Users, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { fetchEpistemicState } from '@/api/graph';
import { useSourceJump } from '@/hooks/useSourceJump';
import { Tooltip } from '@/components/ui/Tooltip';
import { PageFailure } from '@/components/ui/PageFailure';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { failureKind, techDetailOf } from '@/api/failureKind';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { ChapterTimeline, type TimelineMarker } from './ChapterTimeline';
import { getChapter, getTitle, getDescription, getId } from './epistemicEventUtils';
import { qk } from '@/api/queryKeys';

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

  // Cache-only: moving the cursor to an uncached chapter answers known/unknown
  // for free; misbeliefs (the LLM step) wait for an explicit button press.
  const { data: state, isFetching, error, refetch } = useEpistemicState(
    bookId,
    characterId,
    queriedChapter,
    { cachedOnly: true },
  );
  const inferMisbeliefs = useMutation({
    mutationFn: (v: { characterId: string; chapter: number }) =>
      fetchEpistemicState(bookId, v.characterId, v.chapter),
    onSuccess: (full, v) => {
      queryClient.setQueryData(qk.epistemic.atCached(bookId, v.characterId, v.chapter), full);
    },
  });
  // The mutation outlives cursor moves and character switches; only report
  // its state for the (character, chapter) currently on screen.
  const inferTarget = inferMisbeliefs.variables;
  const inferIsCurrent =
    inferTarget?.characterId === characterId && inferTarget.chapter === state?.upToChapter;
  const misbeliefsPending = state != null && !state.misbeliefsInferred;
  // Still not inferred after an explicit request → no LLM provider configured.
  const inferUnconfigured =
    inferIsCurrent && inferMisbeliefs.data != null && !inferMisbeliefs.data.misbeliefsInferred;
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

  // No data at all and the request failed: say so instead of drawing an empty cursor.
  if (!state && error) {
    return (
      <PageFailure
        variant={failureKind(error)}
        pageName={t('character.tabs.epistemic')}
        onRetry={() => void refetch()}
        techDetail={techDetailOf(error)}
      />
    );
  }

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
              queryKey: qk.epistemic.all(bookId),
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
        <h2 className="ca-epi-summary-title">{t('character.tabs.epistemic')}</h2>
        <span className="ca-epi-summary-chapter">
          {t('character.epistemic.upToChapter')} {t('character.epistemic.chapterN', { n: displayedChapter })}
        </span>
        {/* Text + count in a badge: the Ink theme flattens success / warning /
            error to one near-black, so the label has to carry the meaning. */}
        <span className="ss-badge ss-badge-success">
          {t('character.epistemic.knownLabel')} {optimistic?.known.length ?? 0}
        </span>
        <span className="ss-badge ss-badge-warning">
          {t('character.epistemic.unknownLabel')} {optimistic?.unknown.length ?? 0}
        </span>
        <span className="ss-badge ss-badge-error">
          {t('character.epistemic.misbeliefShortLabel')}{' '}
          {misbeliefsPending ? '—' : optimistic?.misbeliefs.length ?? 0}
        </span>
        <span className="ca-epi-summary-note">
          {isFetching ? t('character.epistemic.computing') : t('character.epistemic.summarySubtitle')}
        </span>
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-secondary ca-epi-compare-btn"
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
              <span className="ca-epi-block-count">
                {misbeliefsPending ? '—' : optimistic.misbeliefs.length}
              </span>
            </div>
            {misbeliefsPending ? (
              inferUnconfigured ? (
                <LlmUnconfiguredNotice />
              ) : (
                <div>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
                    {t('character.epistemic.misbeliefPending', { n: state.upToChapter })}
                  </p>
                  <button
                    type="button"
                    className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                    style={{ marginTop: 'var(--space-4)' }}
                    disabled={inferIsCurrent && inferMisbeliefs.isPending}
                    onClick={() =>
                      inferMisbeliefs.mutate({ characterId, chapter: state.upToChapter })
                    }
                  >
                    {inferIsCurrent && inferMisbeliefs.isPending
                      ? t('character.epistemic.inferringMisbeliefs')
                      : t('character.epistemic.inferMisbeliefs')}
                  </button>
                  <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
                    {inferIsCurrent && inferMisbeliefs.isError
                      ? t('character.epistemic.inferMisbeliefsFailed')
                      : t('tension.state.tokenHintShort')}
                  </p>
                </div>
              )
            ) : optimistic.misbeliefs.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
                {t('character.epistemic.misbeliefEmpty')}
              </p>
            ) : (
              optimistic.misbeliefs.map((m) => {
                // The misbelief item carries only sourceEventId; the event title
                // comes from the matching unknown event (no match → no title row).
                const sourceEvent = (state?.unknownEvents as Record<string, unknown>[] | undefined)?.find(
                  (ev) => String(ev.id ?? ev.eventId ?? '') === m.sourceEventId,
                );
                const eventTitle = sourceEvent ? getTitle(sourceEvent) : '';
                return (
                <div key={m.sourceEventId} className="ca-misbelief">
                  {eventTitle && (
                    <div className="event-title">
                      <span className="glyph" aria-hidden="true">✕</span>
                      {eventTitle}
                    </div>
                  )}
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
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** #4: a known/unknown event row, clickable when its chapter is known — jumps
 * to the reader passage via #23a semantic search (same-chapter filtered,
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
    <Tooltip label={t('character.sourceJump.cta')}>
      <button type="button" className={rowClass} onClick={onJump} disabled={pending}>
        <span className="ca-epi-event-name">{title}</span>
        {pending ? (
          <Loader size={11} className="ca-srcjump-spinner animate-spin" aria-label={t('character.sourceJump.locating')} />
        ) : (
          chapter != null && <span className="ca-epi-event-ch">Ch.{chapter}</span>
        )}
      </button>
    </Tooltip>
  );
}
