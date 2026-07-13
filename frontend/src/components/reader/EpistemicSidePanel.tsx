import { useState, useMemo } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { useQueryClient } from '@tanstack/react-query';
import type { Chapter } from '@/api/types';

interface EpistemicSidePanelProps {
  bookId: string;
  chapters: Chapter[];
  currentChapterOrder: number | null;
  onClose: () => void;
  onJumpToChapter: (chapterNumber: number) => void;
}

const eventItemBaseStyle: React.CSSProperties = {
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  width: '100%',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color var(--transition-fast) ease',
};

function EventGroupHeader({ dotColor, label, count }: { dotColor: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span
        style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }}
      />
      <span className="text-xs font-semibold" style={{ color: 'var(--fg-secondary)' }}>{label}</span>
      <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>({count})</span>
    </div>
  );
}

function EventItemButton({
  title,
  chapterNumber,
  color,
  bgColor,
  onJump,
}: {
  title: string;
  chapterNumber: number | null;
  color: string;
  bgColor: string;
  onJump: (chapterNumber: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const clickable = chapterNumber !== null && !Number.isNaN(chapterNumber);
  return (
    <button
      type="button"
      onClick={() => clickable && onJump(chapterNumber)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={!clickable}
      style={{
        ...eventItemBaseStyle,
        backgroundColor: hovered ? 'var(--bg-tertiary)' : bgColor,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <span
        className="text-xs"
        style={{ fontFamily: 'var(--font-serif)', color, lineHeight: 1.4 }}
      >
        {title}
      </span>
      {clickable && (
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--fg-muted)' }}>
          Ch.{chapterNumber}
        </span>
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
}: EpistemicSidePanelProps) {
  const { t } = useTranslation('reader');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [misbeliefHovered, setMisbeliefHovered] = useState<string | null>(null);
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

  return (
    <div
      className="h-full flex flex-col"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>
          {t('epistemicPanel.title')}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70">
          <X size={14} />
        </button>
      </div>

      {/* Character selector */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <select
          className="w-full text-xs rounded px-2 py-1"
          style={{
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--fg-primary)',
          }}
          value={selectedCharacterId ?? ''}
          onChange={(e) => setSelectedCharacterId(e.target.value || null)}
        >
          <option value="">{t('epistemicPanel.selectCharacter')}</option>
          {characterOptions.map(({ id, name }) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {isFetching && (
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>{t('epistemicPanel.computing')}</p>
        )}
        {state && !state.dataComplete && (
          <div className="mt-1 flex flex-col gap-1">
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
              <AlertTriangle size={11} /> {t('epistemicPanel.noVisibilityData')}
            </p>
            <ClassifyVisibilityButton
              bookId={bookId}
              onComplete={() =>
                queryClient.invalidateQueries({
                  queryKey: ['books', bookId, 'epistemic-state'],
                })
              }
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-4">
        {!selectedCharacterId && (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{t('epistemicPanel.selectPrompt')}</p>
        )}

        {state && selectedCharacterId && (
          <>
            {/* Known events */}
            <section>
              <EventGroupHeader
                dotColor="var(--color-success)"
                label={t('epistemicPanel.known')}
                count={state.knownEvents.length}
              />
              {state.knownEvents.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{t('epistemicPanel.none')}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {(state.knownEvents as Record<string, unknown>[]).map((ev, i) => (
                    <EventItemButton
                      key={String(ev.id ?? i)}
                      title={String(ev.title ?? '')}
                      chapterNumber={toChapterNumber(ev)}
                      color="var(--color-success)"
                      bgColor="var(--color-success-bg)"
                      onJump={onJumpToChapter}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Unknown events */}
            <section>
              <EventGroupHeader
                dotColor="var(--color-warning)"
                label={t('epistemicPanel.unknown')}
                count={state.unknownEvents.length}
              />
              {state.unknownEvents.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{t('epistemicPanel.none')}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {(state.unknownEvents as Record<string, unknown>[]).map((ev, i) => (
                    <EventItemButton
                      key={String(ev.id ?? i)}
                      title={String(ev.title ?? '')}
                      chapterNumber={toChapterNumber(ev)}
                      color="var(--color-warning)"
                      bgColor="var(--color-warning-bg)"
                      onJump={onJumpToChapter}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Misbeliefs */}
            {state.misbeliefs.length > 0 && (
              <section>
                <EventGroupHeader
                  dotColor="var(--color-error)"
                  label={t('epistemicPanel.misbeliefs')}
                  count={state.misbeliefs.length}
                />
                <ul className="flex flex-col gap-2">
                  {state.misbeliefs.map((m) => {
                    const sourceEvent = (state.unknownEvents as Record<string, unknown>[]).find(
                      (ev) => String(ev.id ?? '') === m.sourceEventId,
                    );
                    const chapterNumber = sourceEvent ? toChapterNumber(sourceEvent) : null;
                    const clickable = chapterNumber !== null;
                    const hovered = misbeliefHovered === m.sourceEventId;
                    return (
                      <li key={m.sourceEventId}>
                        <button
                          type="button"
                          onClick={() => clickable && onJumpToChapter(chapterNumber)}
                          onMouseEnter={() => setMisbeliefHovered(m.sourceEventId)}
                          onMouseLeave={() => setMisbeliefHovered(null)}
                          disabled={!clickable}
                          className="text-left w-full"
                          style={{
                            border: '1px solid var(--color-error)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '6px 8px',
                            backgroundColor: hovered ? 'var(--bg-tertiary)' : 'var(--color-error-bg)',
                            cursor: clickable ? 'pointer' : 'default',
                            fontFamily: 'inherit',
                            transition: 'background-color var(--transition-fast) ease',
                          }}
                        >
                          <p className="text-xs" style={{ color: 'var(--color-error)' }}>
                            <span className="font-medium">{t('epistemicPanel.misbelief')}</span>{m.characterBelief}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>
                            <span className="font-medium">{t('epistemicPanel.actualTruth')}</span>{m.actualTruth}
                          </p>
                          <p className="text-xs mt-0.5 opacity-50">
                            {t('epistemicPanel.confidence', { percent: Math.round(m.confidence * 100) })}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
