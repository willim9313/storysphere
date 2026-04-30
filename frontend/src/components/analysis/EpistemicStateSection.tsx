import { useState } from 'react';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { useQueryClient } from '@tanstack/react-query';

interface EpistemicStateSectionProps {
  bookId: string;
  characterId: string;
  totalChapters: number;
}

export function EpistemicStateSection({
  bookId,
  characterId,
  totalChapters,
}: EpistemicStateSectionProps) {
  const [upToChapter, setUpToChapter] = useState(totalChapters);
  const queryClient = useQueryClient();
  const { t } = useTranslation('analysis');

  const { data: state, isFetching } = useEpistemicState(bookId, characterId, upToChapter);

  return (
    <div className="flex flex-col gap-4">
      {/* Chapter slider */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>
            {t('character.epistemic.upToChapter')}
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--fg-primary)' }}>
            {t('character.epistemic.chapterN', { n: upToChapter })}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={totalChapters}
          value={upToChapter}
          onChange={(e) => setUpToChapter(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {isFetching && (
        <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          {t('character.epistemic.computing')}
        </p>
      )}

      {state && !state.dataComplete && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
            <AlertTriangle size={11} />
            {t('character.epistemic.noVisibilityData')}
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

      {state && (
        <>
          {/* Known events */}
          <section>
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
              <Eye size={12} />
              {t('character.epistemic.knownEvents', { count: state.knownEvents.length })}
            </h4>
            {state.knownEvents.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                {t('character.epistemic.noKnownEvents')}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(state.knownEvents as Record<string, unknown>[]).map((ev, i) => (
                  <li
                    key={String(ev.id ?? i)}
                    className="text-xs px-2 py-1 rounded flex justify-between items-start gap-2"
                    style={{ backgroundColor: 'var(--color-success-bg)' }}
                  >
                    <span style={{ color: 'var(--color-success)' }}>{String(ev.title ?? '')}</span>
                    <span className="flex-shrink-0 text-xs opacity-60" style={{ color: 'var(--color-success)' }}>
                      Ch.{String(ev.chapter ?? '')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Unknown events */}
          <section>
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
              <EyeOff size={12} />
              {t('character.epistemic.unknownEvents', { count: state.unknownEvents.length })}
            </h4>
            {state.unknownEvents.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                {t('character.epistemic.noUnknownEvents')}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(state.unknownEvents as Record<string, unknown>[]).map((ev, i) => (
                  <li
                    key={String(ev.id ?? i)}
                    className="text-xs px-2 py-1 rounded flex justify-between items-start gap-2"
                    style={{ backgroundColor: 'var(--color-warning-bg)' }}
                  >
                    <span style={{ color: 'var(--color-warning)' }}>{String(ev.title ?? '')}</span>
                    <span className="flex-shrink-0 text-xs opacity-60" style={{ color: 'var(--color-warning)' }}>
                      Ch.{String(ev.chapter ?? '')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Misbeliefs */}
          <section>
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: 'var(--color-error)' }}>
              <AlertTriangle size={12} />
              {t('character.epistemic.misbeliefs', { count: state.misbeliefs.length })}
            </h4>
            {state.misbeliefs.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                {t('character.epistemic.noMisbeliefs')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {state.misbeliefs.map((m) => (
                  <li
                    key={m.sourceEventId}
                    className="text-xs px-3 py-2 rounded"
                    style={{ border: '1px solid var(--color-error)', backgroundColor: 'var(--color-error-bg)' }}
                  >
                    <p style={{ color: 'var(--color-error)' }}>
                      <span className="font-semibold">{t('character.epistemic.misbeliefLabel')}</span>
                      {m.characterBelief}
                    </p>
                    <p className="mt-1" style={{ color: 'var(--fg-muted)' }}>
                      <span className="font-semibold">{t('character.epistemic.actualTruth')}</span>
                      {m.actualTruth}
                    </p>
                    <p className="mt-1 opacity-50" style={{ color: 'var(--fg-muted)' }}>
                      {t('character.epistemic.confidence', { pct: Math.round(m.confidence * 100) })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
