// Hero's Journey — shared visual primitives.
//
// Ink renders every status colour as #151515, so the three stage states are
// told apart by shape and text as well as hue: filled = solid dot + ✓,
// low = light fill with an outline + △, absent = dashed hollow + ○.
import { useTranslation } from 'react-i18next';
import type { HeroJourneyStage, NarrativeReviewStatus } from '@/api/narrative';
import { Tooltip } from '@/components/ui/Tooltip';
import { stageOrdinal, stageState } from './heroJourney';
import { CONFIDENCE_THRESHOLD } from './narrativeModel';

// ── State badge — filled / low-confidence / absent ─────────────────
export function StateBadge({ stage }: { stage: HeroJourneyStage }) {
  const { t } = useTranslation('analysis');
  const st = stageState(stage);
  if (st === 'absent') {
    return (
      <span className="ss-badge nl-badge-absent">
        <span aria-hidden="true">○</span> {t('narrative.state.absent')}
      </span>
    );
  }
  if (st === 'low') {
    return (
      <span className="ss-badge ss-badge-warning">
        <span aria-hidden="true">△</span> {t('narrative.state.low')}
      </span>
    );
  }
  return (
    <span className="ss-badge ss-badge-success">
      <span aria-hidden="true">✓</span> {t('narrative.state.filled')}
    </span>
  );
}

// ── Review badge — book-level HITL status (three values) ───────────
export function ReviewBadge({ status }: { status: NarrativeReviewStatus }) {
  const { t } = useTranslation('analysis');
  const label = {
    pending: t('narrative.review.pending'),
    approved: t('narrative.review.approved'),
    rejected: t('narrative.review.rejected'),
  }[status] ?? t('narrative.review.pending');
  return (
    <span className={status === 'approved' ? 'ss-badge ss-badge-success' : 'ss-badge nl-badge-quiet'}>
      {label}
    </span>
  );
}

// ── Confidence meter ───────────────────────────────────────────────
// A bare "0.90" says nothing on its own. The 0.6 tick is stageState's own
// filled/low boundary; the peer range is what the rest of this book scored.
// Below the threshold the fill goes to the light step and the chip to a
// dashed outline — the stage is still shown, marked as awaiting confirmation.
export function ConfidenceMeter({
  stage,
  span,
}: {
  stage: HeroJourneyStage;
  span: { min: number; max: number } | null;
}) {
  const { t } = useTranslation('analysis');
  if (stageState(stage) === 'absent') {
    return <span className="nl-conf-none">—</span>;
  }
  const above = stage.confidence >= CONFIDENCE_THRESHOLD;
  return (
    <div className="nl-conf">
      <div className="nl-conf-row">
        <span>{t('narrative.confidence')}</span>
        <span className="nl-conf-val">{stage.confidence.toFixed(2)}</span>
      </div>
      <div className="nl-conf-bar">
        <span
          className={above ? 'nl-conf-fill' : 'nl-conf-fill is-low'}
          style={{ width: `${Math.round(stage.confidence * 100)}%` }}
        />
        <span className="nl-conf-tick" />
      </div>
      <div className="nl-conf-scale">
        <span className="nl-conf-s0">0</span>
        <span className="nl-conf-s6">{t('narrative.threshold')}</span>
        <span className="nl-conf-s1">1.0</span>
      </div>
      <div className="nl-conf-state">
        <span className={above ? 'nl-conf-chip' : 'nl-conf-chip is-low'}>
          {above ? t('narrative.confAbove') : t('narrative.confBelow')}
        </span>
        {span && (
          <span className="nl-conf-peer">
            {t('narrative.confPeer', { min: span.min.toFixed(2), max: span.max.toFixed(2) })}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────
export function Legend() {
  const { t } = useTranslation('analysis');
  return (
    <div className="nl-legend">
      <span className="nl-legend-k">{t('narrative.legend')}</span>
      <span className="nl-legend-i">
        <span className="nl-dot-sw is-filled" /> {t('narrative.state.filled')}
      </span>
      <span className="nl-legend-i">
        <span className="nl-dot-sw is-low" /> {t('narrative.state.low')}
      </span>
      {/* Short label here; what an absence means, and how many there are, lives
          in the note under the switcher. */}
      <span className="nl-legend-i">
        <span className="nl-dot-sw is-absent" /> {t('narrative.state.absent')}
      </span>
    </div>
  );
}

// ── Stage dot — numbered node used by track, columns and ring ──────
export function StageDot({
  stage,
  selected,
  onSelect,
  size,
  tooltip,
}: {
  stage: HeroJourneyStage;
  selected: boolean;
  onSelect: () => void;
  /** Pixel diameter — a geometry value of the layout, not a spacing token. */
  size: number;
  tooltip?: string;
}) {
  const st = stageState(stage);
  const dot = (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={tooltip}
      className={`nl-dot is-${st}${selected ? ' is-selected' : ''}`}
      style={{ width: size, height: size }}
      onClick={onSelect}
    >
      {stageOrdinal(stage.stage_id)}
    </button>
  );
  return tooltip ? <Tooltip label={tooltip}>{dot}</Tooltip> : dot;
}
