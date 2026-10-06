import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, Scale } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { densityBarHeight } from './tensionModel';

/** "會呼叫 LLM、消耗 token" — plain text wherever an action spends money.
 *  The glyph lives on the button (`ss-btn-llm`), never on this hint. */
function CostHint({ text }: { text: string }) {
  return <span className="tn-cost-hint">{text}</span>;
}

export interface TeuFailure {
  event_id: string;
  title: string;
  chapter: number;
  reason: string;
}

/**
 * Step 1's partial failures. Collapsed by default: most events succeeded, so
 * this is a footnote. It only describes the run that just finished — nothing
 * persists it per book, and the hint says so.
 */
export function TensionFailureList({ failures }: { failures: TeuFailure[] }) {
  const { t } = useTranslation('analysis');
  if (failures.length === 0) return null;
  return (
    <details className="tn-failures">
      <summary>{t('tension.failures.summary', { count: failures.length })}</summary>
      <ul>
        {failures.map((f) => (
          <li key={f.event_id}>
            <span className="tn-failure-where">{t('tension.failures.chapter', { chapter: f.chapter })}</span>
            <span>{f.title}</span>
            <code className="tn-failure-reason">{f.reason}</code>
          </li>
        ))}
      </ul>
      <p className="tn-failures-hint">{t('tension.failures.hint')}</p>
    </details>
  );
}

export function TensionEmptyCard({
  onStart,
  bookId,
  conceptsMissing = false,
}: {
  onStart: () => void;
  bookId: string;
  /** The build manifest loaded and no inferred Concept nodes exist. */
  conceptsMissing?: boolean;
}) {
  const { t } = useTranslation('analysis');
  return (
    <div className="ss-state ss-state-stage ss-state-ready tn-empty">
      <Scale size={72} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" className="tn-empty-spot" />
      <h3 className="ss-state-title">{t('tension.state.emptyTitle')}</h3>
      <p className="ss-state-text">{t('tension.state.emptyBody')}</p>
      {/* A missing prerequisite, not a blocker: TEU assembly works without
          inferred Concepts, but the evidence cannot be topped up afterwards. */}
      {conceptsMissing && (
        <div className="tn-note is-warning tn-empty-note">
          <span>{t('tension.state.conceptsMissing')}</span>
          <Link to={`/books/${bookId}/unraveling`}>{t('tension.state.conceptsMissingCta')} →</Link>
        </div>
      )}
      {/* One button only: no "run all three", which would skip both gates. */}
      <div className="tn-empty-cta">
        <button type="button" className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm" onClick={onStart}>
          {t('tension.state.startStep1')}
        </button>
        <CostHint text={t('tension.state.tokenHintLong')} />
      </div>
    </div>
  );
}

export function TensionStep1Card({
  teuCount,
  runCount,
  sceneSummary,
  chapterCounts,
  failures,
  onGroup,
}: {
  teuCount: number;
  /** Stretches of continuous narration; equals teuCount when nothing groups. */
  runCount: number;
  /** Scenes, kept apart from the chapters that have no answer. */
  sceneSummary: { total: number; knownChapters: number; unknownChapters: number };
  /** [chapter, teuCount, runCount, sceneCount | null] in chapter order. */
  chapterCounts: [number, number, number, number | null][];
  failures: TeuFailure[];
  onGroup: () => void;
}) {
  const { t } = useTranslation('analysis');
  const max = chapterCounts.reduce((m, [, teus]) => Math.max(m, teus), 0);
  return (
    <div className="tn-card tn-step1">
      <div className="tn-step1-head">
        <h3>{t('tension.state.step1Title', { count: teuCount, runs: runCount })}</h3>
        {/* Scenes are text, never a bar: "cannot determine" must not read as 0
            or 1 (B-068). */}
        <span className="tn-step1-scenes">
          {sceneSummary.knownChapters === 0
            ? t('tension.state.scenesNone')
            : sceneSummary.unknownChapters === 0
              ? t('tension.state.scenes', { count: sceneSummary.total })
              : t('tension.state.scenesPartial', {
                  count: sceneSummary.total,
                  chapters: sceneSummary.knownChapters,
                  unknown: sceneSummary.unknownChapters,
                })}
        </span>
      </div>
      {/* One neutral colour: a TEU count is not an intensity, so no analysis
          family colours it. The number sits on the bar; hover gives the runs. */}
      <div
        className="tn-density"
        style={{ gridTemplateColumns: `repeat(${Math.max(chapterCounts.length, 1)}, minmax(0, 1fr))` }}
      >
        {chapterCounts.map(([chapter, teus, runs, scenes]) => (
          <Tooltip
            key={chapter}
            label={
              t('tension.state.chapterDensity', { n: chapter, teus, runs }) +
              ' · ' +
              (scenes == null
                ? t('tension.state.chapterScenesUnknown')
                : t('tension.state.chapterScenes', { count: scenes }))
            }
          >
            <div className="tn-density-col">
              <span className="tn-density-n">{teus}</span>
              <span className="tn-density-bar" style={{ height: densityBarHeight(teus, max) }} />
              <span className="tn-density-ch">{t('tension.state.chapterShort', { n: chapter })}</span>
            </div>
          </Tooltip>
        ))}
      </div>
      <p className="tn-step1-body">{t('tension.state.step1Body')}</p>
      <div className="tn-step1-actions">
        <button type="button" className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm" onClick={onGroup}>
          {t('tension.state.runStep2')}
        </button>
        <CostHint text={t('tension.state.tokenHintShort')} />
      </div>
      <TensionFailureList failures={failures} />
    </div>
  );
}

/** One running step. The backend's own stage string is deliberately not shown,
 *  and no ETA is promised. */
export function TensionRunningCard({ title, progress }: { title: string; progress: number }) {
  const { t } = useTranslation('analysis');
  return (
    <div className="tn-card tn-run" role="status">
      <div className="tn-run-row">
        <Loader2 size={14} className="tn-spin" aria-hidden="true" />
        <span className="tn-run-title">{title}</span>
        <span className="tn-run-pct">{Math.round(progress)}%</span>
      </div>
      <div className="ss-progress">
        <div className="ss-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="tn-run-hint">{t('tension.state.runningHint')}</span>
    </div>
  );
}

/** Inserted above the previous result rather than replacing it. */
export function TensionErrorCard({
  title,
  message,
  retryLabel,
  onRetry,
  meta,
}: {
  title: string;
  message: ReactNode;
  retryLabel: string;
  onRetry: () => void;
  meta?: string | null;
}) {
  return (
    <div className="tn-note is-error tn-alert" role="alert">
      <span className="tn-alert-title">{title}</span>
      <span className="tn-alert-body">{message}</span>
      <div className="tn-alert-actions">
        <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm" onClick={onRetry}>
          {retryLabel}
        </button>
        {meta && <span className="tn-meta-mono">{meta}</span>}
      </div>
    </div>
  );
}

/** Soft gate: the synthesise action only appears once every line is ruled on.
 *  Nothing forbids synthesising early, but the page stops offering it. */
export function TensionSoftGate({
  unreviewed,
  onSynthesize,
}: {
  unreviewed: number;
  onSynthesize: () => void;
}) {
  const { t } = useTranslation('analysis');
  return (
    <div className="tn-card tn-gate">
      {unreviewed > 0 ? (
        <>
          <span className="tn-gate-text">{t('tension.stage.themeRemaining', { count: unreviewed })}</span>
          <span className="tn-gate-hint">{t('tension.state.gateHint')}</span>
        </>
      ) : (
        <>
          <span className="tn-gate-text">{t('tension.stage.themeReady')}</span>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm" onClick={onSynthesize}>
            {t('tension.stage.synthesize')}
          </button>
          <CostHint text={t('tension.state.tokenHintShort')} />
        </>
      )}
    </div>
  );
}
