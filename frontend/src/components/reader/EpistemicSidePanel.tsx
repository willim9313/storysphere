import { useState, useMemo } from 'react';
import { AlertTriangle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { findBestPassage } from '@/lib/passageLookup';
import { useQueryClient } from '@tanstack/react-query';
import type { Chapter } from '@/api/types';
import { qk } from '@/api/queryKeys';

interface EpistemicSidePanelProps {
  bookId: string;
  chapters: Chapter[];
  currentChapterOrder: number | null;
  onClose: () => void;
  /** Fallback: chapter-level jump, used when the passage lookup finds nothing. */
  onJumpToChapter: (chapterNumber: number) => void;
  /** Paragraph-level jump — chunkId comes from the #23a passage lookup below. */
  onJumpToChunk: (chapterNumber: number, chunkId: string) => void;
}

type EventKind = 'known' | 'unknown';

// Ink collapses every status colour to the same near-black, so each group
// carries a glyph as well: ✓ known · ? unknown · ✕ misbelief.
const GLYPH: Record<EventKind | 'misbelief', string> = { known: '✓', unknown: '?', misbelief: '✕' };

function EventGroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="rd-ep-group-head">
      <span>{label}</span>
      <span className="rd-ep-count">{count}</span>
    </div>
  );
}

function EventItemButton({
  title,
  chapterNumber,
  kind,
  locating,
  locatingLabel,
  onJump,
}: {
  title: string;
  chapterNumber: number | null;
  kind: EventKind;
  /** True while this item's passage lookup (#23a) is in flight. */
  locating: boolean;
  locatingLabel: string;
  onJump: () => void;
}) {
  const clickable = chapterNumber !== null && !Number.isNaN(chapterNumber);
  return (
    <button
      type="button"
      onClick={() => clickable && onJump()}
      disabled={!clickable}
      className={`rd-ep-item is-${kind}`}
    >
      <span className="rd-ep-item-title">
        <span className="rd-ep-glyph" aria-hidden="true">{GLYPH[kind]}</span>
        <span>{title}</span>
      </span>
      {locating ? (
        <Loader size={12} className="animate-spin flex-shrink-0" aria-label={locatingLabel} />
      ) : (
        clickable && <span className="rd-ep-item-chapter">Ch.{chapterNumber}</span>
      )}
    </button>
  );
}

export function EpistemicSidePanel({
  bookId,
  chapters,
  currentChapterOrder,
  onClose,
  onJumpToChapter,
  onJumpToChunk,
}: EpistemicSidePanelProps) {
  const { t } = useTranslation('reader');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Collect all characters from top-entities across all chapters up to current
  const characterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    const upTo = currentChapterOrder ?? 1;
    for (const ch of chapters) {
      if (ch.order > upTo) break;
      for (const e of ch.topEntities ?? []) {
        if (e.type === 'character' && !seen.has(e.id)) {
          seen.set(e.id, e.name);
        }
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [chapters, currentChapterOrder]);

  const { data: state, isFetching } = useEpistemicState(
    bookId,
    selectedCharacterId,
    currentChapterOrder,
  );

  const toChapterNumber = (ev: Record<string, unknown>): number | null => {
    const n = typeof ev.chapter === 'number' ? ev.chapter : Number(ev.chapter);
    return Number.isNaN(n) ? null : n;
  };

  // Paragraph-level jump: the epistemic API only carries a chapter number per
  // event, so the exact passage is resolved on demand — #23a semantic search
  // over the event's title+description, restricted to hits in that chapter.
  // Falls back to a chapter-level jump when nothing in-chapter surfaces (or
  // the search fails). One lookup in flight at a time.
  const handleEventJump = async (ev: Record<string, unknown>) => {
    const chapterNumber = toChapterNumber(ev);
    if (chapterNumber === null || locatingId) return;
    const evKey = String(ev.id ?? ev.title ?? '');
    setLocatingId(evKey);
    try {
      const query = `${String(ev.title ?? '')}。${String(ev.description ?? '')}`;
      const best = await findBestPassage(query, bookId, chapterNumber);
      if (best?.id) {
        onJumpToChunk(chapterNumber, best.id);
      } else {
        onJumpToChapter(chapterNumber);
      }
    } catch {
      onJumpToChapter(chapterNumber);
    } finally {
      setLocatingId(null);
    }
  };

  const renderGroup = (kind: EventKind, label: string, events: Record<string, unknown>[]) => (
    <section>
      <EventGroupHeader label={label} count={events.length} />
      {events.length === 0 ? (
        <p className="rd-ep-muted">{t('epistemicPanel.none')}</p>
      ) : (
        <div className="rd-ep-list">
          {events.map((ev, i) => (
            <EventItemButton
              key={String(ev.id ?? i)}
              title={String(ev.title ?? '')}
              chapterNumber={toChapterNumber(ev)}
              kind={kind}
              locating={locatingId === String(ev.id ?? ev.title ?? '')}
              locatingLabel={t('epistemicPanel.locating')}
              onJump={() => handleEventJump(ev)}
            />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="rd-ep">
      {/* Header */}
      <div className="rd-ep-head">
        <div className="rd-ep-title-row">
          <span className="rd-ep-title">{t('epistemicPanel.title')}</span>
          <button type="button" onClick={onClose} className="ss-btn ss-btn-sm ss-btn-ghost">
            {t('epistemicClose')}
          </button>
        </div>
        <select
          className="rd-ep-select"
          value={selectedCharacterId ?? ''}
          onChange={(e) => setSelectedCharacterId(e.target.value || null)}
          aria-label={t('epistemicPanel.title')}
        >
          <option value="">{t('epistemicPanel.selectCharacter')}</option>
          {characterOptions.map(({ id, name }) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {/* Field provenance (B-065, layer 3). The roster is not the book's
            cast: it is every `character` inside `topEntities` for chapters 1..N,
            and `top_entities` is `unique_ents[:5]` on the backend — the first
            five distinct entities in paragraph order, not the five most
            frequent. On the seed book that yields one name in chapter 1 out of
            eleven characters, and 伊內絲 — the protagonist, tagged all over the
            same page — is not among them. Without this line the panel reads as
            broken, and the repair a reader would reach for (re-running an
            analysis, at token cost) is not the one that works: reading further
            is. Non-dismissible, per UI_SPEC §4.2. */}
        <p className="rd-ep-note">{t('epistemicPanel.rosterNote')}</p>
        {currentChapterOrder !== null && (
          <p className="rd-ep-cutoff">{t('epistemicPanel.cutoff', { n: currentChapterOrder })}</p>
        )}
        {isFetching && (
          <p className="rd-ep-muted rd-ep-computing" role="status">
            <Loader size={12} className="animate-spin" aria-hidden="true" />
            {t('epistemicPanel.computing')}
          </p>
        )}
        {state && !state.dataComplete && (
          <>
            <p className="rd-ep-warn">
              <AlertTriangle size={11} /> {t('epistemicPanel.noVisibilityData')}
            </p>
            <ClassifyVisibilityButton
              bookId={bookId}
              onComplete={() =>
                queryClient.invalidateQueries({
                  queryKey: qk.epistemic.all(bookId),
                })
              }
            />
          </>
        )}
      </div>

      {/* Content */}
      <div className="rd-ep-body">
        {!selectedCharacterId && <p className="rd-ep-muted">{t('epistemicPanel.selectPrompt')}</p>}

        {state && selectedCharacterId && (
          <>
            {renderGroup('known', t('epistemicPanel.known'), state.knownEvents as Record<string, unknown>[])}
            {renderGroup('unknown', t('epistemicPanel.unknown'), state.unknownEvents as Record<string, unknown>[])}

            {/* Misbeliefs — an empty group still shows its head (0) and （無）, like the other two (08 E 區). */}
            <section>
              <EventGroupHeader label={t('epistemicPanel.misbeliefs')} count={state.misbeliefs.length} />
              {state.misbeliefs.length === 0 ? (
                <p className="rd-ep-muted">{t('epistemicPanel.none')}</p>
              ) : (
                <ul className="rd-ep-list">
                  {state.misbeliefs.map((m) => {
                    const sourceEvent = (state.unknownEvents as Record<string, unknown>[]).find(
                      (ev) => String(ev.id ?? '') === m.sourceEventId,
                    );
                    const chapterNumber = sourceEvent ? toChapterNumber(sourceEvent) : null;
                    const clickable = chapterNumber !== null && sourceEvent !== undefined;
                    // Event title comes from the matching unknown event; no match, no title row.
                    const eventTitle = sourceEvent ? String(sourceEvent.title ?? '') : '';
                    return (
                      <li key={m.sourceEventId}>
                        <button
                          type="button"
                          onClick={() => clickable && handleEventJump(sourceEvent)}
                          disabled={!clickable}
                          className="rd-ep-item rd-ep-misbelief"
                        >
                          {eventTitle && (
                            <p className="is-title">
                              <span className="rd-ep-glyph" aria-hidden="true">{GLYPH.misbelief}</span>
                              <span>{eventTitle}</span>
                            </p>
                          )}
                          <div className={eventTitle ? 'rd-ep-misbelief-body' : undefined}>
                            <p className="is-belief">
                              {!eventTitle && (
                                <span className="rd-ep-glyph" aria-hidden="true">{GLYPH.misbelief} </span>
                              )}
                              <b>{t('epistemicPanel.misbelief')}</b>{m.characterBelief}
                            </p>
                            <p className="is-truth">
                              <b>{t('epistemicPanel.actualTruth')}</b>{m.actualTruth}
                            </p>
                            <p className="is-confidence">
                              {t('epistemicPanel.confidence', { percent: Math.round(m.confidence * 100) })}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Block note (B-065, layer 2): the known/unknown split is a rule,
                not a judgement, and the rule is short enough to state. Copied
                from EpistemicStateService.get_character_knowledge:
                  known   = character_id in e.participants or e.visibility == "public"
                  unknown = character_id not in e.participants and e.visibility != "public"
                over `kg.get_snapshot(document_id, "chapter", up_to_chapter)`.
                Sits under the three groups (08 E 區); non-dismissible. */}
            <p className="rd-ep-note">{t('epistemicPanel.rule')}</p>
          </>
        )}
      </div>
    </div>
  );
}
