/**
 * Event detail panel.
 *
 * Note what is deliberately absent: the old panel had a "時序關係" section
 * built on the backend's `priorEventIds` / `subsequentEventIds`, which are
 * neither causal nor temporal — they are "events sharing a participant in an
 * earlier/later chapter". Labelling that as temporal order on a page whose
 * whole subject is temporal order was actively misleading, so it is gone
 * rather than renamed (the event analysis page kept an equivalent under the
 * honest name 上下文位置 in PR #18).
 *
 * Around four in five events have no analysis at all, so the unanalyzed state
 * is the primary one here, not an edge case.
 */

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { OUTLIER_THRESHOLD, type TimelineDatum } from '@/lib/timelineGeometry';

/** Participant pills rendered before overflowing into a "+N" chip. */
const PILL_LIMIT = 8;

interface EventDetailPanelProps {
  datum: TimelineDatum;
  totalEvents: number;
  unanalyzedCount: number;
  chapterTitle?: string;
  eventTypeLabel: (type: string) => string;
  sourceJumpPending: boolean;
  onClose: () => void;
  onJumpToSource: () => void;
  onOpenGraph: () => void;
}

export function EventDetailPanel({
  datum,
  totalEvents,
  unanalyzedCount,
  chapterTitle,
  eventTypeLabel,
  sourceJumpPending,
  onClose,
  onJumpToSource,
  onOpenGraph,
}: EventDetailPanelProps) {
  const { t } = useTranslation('analysis');

  const participants = datum.event.participants;
  const visible = participants.slice(0, PILL_LIMIT);
  const overflow = participants.length - visible.length;

  /* Read `importance`, not `hasAnalysis`: the two can disagree. The backend
     counts an event as analyzed before parsing its EEP and swallows the error
     if that parse fails, so an analyzed event can still have no importance —
     and it used to be labelled 衛 on that basis. */
  const kind =
    datum.importance === 'KERNEL'
      ? t('timeline.panel.kernel')
      : datum.importance === 'SATELLITE'
        ? t('timeline.panel.satellite')
        : t('timeline.panel.unrated');

  return (
    <aside className="tl-panel" aria-label={t('timeline.panel.region')}>
      <header className="tl-panel-head">
        <span className="tl-panel-eyebrow">{t('timeline.panel.eyebrow')}</span>
        <button
          type="button"
          className="tl-panel-close"
          onClick={onClose}
          aria-label={t('timeline.closePanel')}
        >
          <X size={14} />
        </button>
      </header>

      <div className="tl-panel-body">
        <div className="tl-panel-block">
          <div className="tl-panel-kicker">
            <span className="tl-panel-ch">Ch.{datum.chapter}</span>
            {chapterTitle && <span>{chapterTitle}</span>}
            <span>{eventTypeLabel(datum.event.eventType)}</span>
          </div>
          <h2 className="tl-panel-title">{datum.title}</h2>
          {/* Muting tracks the label it styles: the unrated state is the one
              that should read as absent, whether or not analysis ran. */}
          <span className={`tl-panel-kind${datum.importance === null ? ' muted' : ''}`}>
            {kind}
          </span>
        </div>

        <p className="tl-panel-desc">
          {datum.event.description ||
            t('timeline.panel.noSummary', { n: unanalyzedCount })}
        </p>

        {participants.length > 0 && (
          <div className="tl-panel-block bordered">
            <div className="tl-panel-label">
              {t('timeline.panel.participants')}
              <span className="tl-panel-count">
                {t('timeline.panel.participantCount', { n: participants.length })}
              </span>
            </div>
            <div className="tl-panel-pills">
              {visible.map((p) => (
                <span className={`tl-pill tl-pill-${p.type}`} key={p.id}>
                  {p.name}
                </span>
              ))}
              {overflow > 0 && (
                <span className="tl-pill tl-pill-overflow">
                  {t('timeline.panel.morePills', { n: overflow })}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="tl-panel-block bordered">
          <div className="tl-panel-label">{t('timeline.panel.timing')}</div>
          <div className="tl-panel-rank">
            <span className="tl-panel-rank-value">
              {datum.chronologicalRank === null
                ? t('timeline.panel.noRank')
                : `rank ${datum.chronologicalRank.toFixed(3)}`}
            </span>
            <span className="tl-panel-position">
              {t('timeline.panel.position', { i: datum.index + 1, n: totalEvents })}
            </span>
          </div>
          <span className={`tl-panel-dev${datum.outlier ? ' outlier' : ''}`}>
            {deviationText(datum, t)}
          </span>
          <span className={`tl-narrative-chip tl-narrative-${datum.mode}`}>
            {t('timeline.panel.mode')} · {t(`timeline.narrativeModes.${datum.mode}`)}
          </span>
          {/* The #21h verdict is a separate claim from the deviation above it,
              and carries its own ranks — showing both is the point. */}
          {datum.displacement && (
            <span className={`tl-panel-verdict ${datum.displacement.type}`}>
              {t('timeline.panel.verdict', {
                type: t(`timeline.displacementTypes.${datum.displacement.type}`),
                text: datum.displacement.textRank,
                story: Math.round(datum.displacement.storyRank),
              })}
            </span>
          )}
        </div>

        <div className="tl-panel-actions">
          <button
            type="button"
            className="tl-btn"
            onClick={onJumpToSource}
            disabled={sourceJumpPending}
          >
            {sourceJumpPending
              ? t('character.sourceJump.locating')
              : t('timeline.panel.gotoReader')}
          </button>
          <button type="button" className="tl-btn" onClick={onOpenGraph}>
            {t('timeline.panel.gotoGraph')}
          </button>
        </div>
      </div>
    </aside>
  );
}

function deviationText(
  datum: TimelineDatum,
  t: ReturnType<typeof useTranslation<'analysis'>>['t'],
): string {
  if (datum.deviation === null) return t('timeline.panel.needsStoryTime');
  const abs = Math.abs(datum.deviation);
  if (abs < 0.05) return t('timeline.panel.devAligned');
  if (abs <= OUTLIER_THRESHOLD) {
    return t('timeline.panel.devSlight', { v: datum.deviation.toFixed(2) });
  }
  return datum.deviation < 0
    ? t('timeline.panel.devFlashback', { v: datum.deviation.toFixed(2) })
    : t('timeline.panel.devFlashforward', { v: `+${datum.deviation.toFixed(2)}` });
}
