/**
 * 分析動作面板 — the right half of the toolbar. Two rows, four segments each:
 * 動作 / 目前狀態 / 成本或阻擋原因 / 按鈕 (grid `110px 1fr auto`). It must not
 * collapse into one button: a blocked run needs its live numbers and its way
 * out next to it.
 *
 * Both run buttons carry the LLM glyph, the blocked one included — the gate
 * decides whether it can run, not whether it costs. While a task runs the
 * third segment shows leavePageOk and the fourth becomes 中止 (zero cost, no
 * glyph). The two tasks are independent and may run at the same time.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';

export interface ActionRowState {
  /** Enabled and clickable. */
  ready: boolean;
  running: boolean;
  /** 0–1 while running, else null. */
  progress: number | null;
  /** Segment 2: status or progress sentence. */
  status: string;
  /** Segment 3: cost, or the way out of a blocker. */
  sub: string;
  /** True when `status`/`sub` explain a blocker (partial colour, linked). */
  blocked: boolean;
  /** Run-button label — differs between first run and re-run. */
  runLabel: string;
  onSubClick?: () => void;
}

interface TimelineActionPanelProps {
  storyOrder: ActionRowState;
  onRunStoryOrder: () => void;
  onCancelStoryOrder: () => void;
  displacement: ActionRowState;
  onRunDisplacement: () => void;
  onCancelDisplacement: () => void;
  /** 倒敘與預敘 finished without calling the LLM (coverage below the gate). */
  displacementSkipped: boolean;
  onDismissSkipped: () => void;
  /** A trigger answered with the app's own 503. */
  llmBlocked: boolean;
}

export function TimelineActionPanel({
  storyOrder,
  onRunStoryOrder,
  onCancelStoryOrder,
  displacement,
  onRunDisplacement,
  onCancelDisplacement,
  displacementSkipped,
  onDismissSkipped,
  llmBlocked,
}: TimelineActionPanelProps) {
  const { t } = useTranslation('analysis');

  return (
    <section className="tl-actions" aria-label={t('timeline.toolbar.analysis')}>
      <div className="tl-actions-head">
        <span className="tl-actions-title">{t('timeline.toolbar.analysis')}</span>
        <span className="tl-actions-note">{t('timeline.toolbar.analysisNote')}</span>
      </div>
      <ActionRow
        first
        name={t('timeline.action.storyOrder')}
        state={storyOrder}
        onRun={onRunStoryOrder}
        onCancel={onCancelStoryOrder}
      />
      <ActionRow
        name={t('timeline.action.displacement')}
        state={displacement}
        onRun={onRunDisplacement}
        onCancel={onCancelDisplacement}
      />
      {displacementSkipped && (
        <div className="tl-skipped" role="status">
          <div className="tl-skipped-head">
            <AlertTriangle size={15} aria-hidden="true" />
            <span className="tl-skipped-title">{t('timeline.toast.displacementSkipped')}</span>
          </div>
          <p className="tl-skipped-desc">{t('timeline.toast.displacementSkippedDesc')}</p>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary"
            onClick={onDismissSkipped}
          >
            {t('timeline.closePanel')}
          </button>
        </div>
      )}
      {llmBlocked && <LlmUnconfiguredNotice />}
    </section>
  );
}

function ActionRow({
  name,
  state,
  onRun,
  onCancel,
  first,
}: {
  name: string;
  /** `displacement` names a specific theory (Genette), so the name doubles as
   *  the way out to its methodology entry. */
  state: ActionRowState;
  onRun: () => void;
  onCancel: () => void;
  first?: boolean;
}) {
  const { t } = useTranslation('analysis');
  const hollow = state.blocked && !state.running;

  return (
    <div className={`tl-action-row${first ? ' is-first' : ''}`}>
      <div className="tl-action-name">
        {state.running ? (
          <Loader2 size={13} className="tl-spinner" aria-hidden="true" />
        ) : (
          <span className={`tl-action-dot${hollow ? ' is-hollow' : ''}`} aria-hidden="true" />
        )}
        <span>{name}</span>
      </div>
      <div className="tl-action-text">
        <span className={`tl-action-status${hollow ? ' is-blocked' : ''}`}>{state.status}</span>
        {state.onSubClick && !state.running ? (
          <button type="button" className="tl-action-sub is-link" onClick={state.onSubClick}>
            {state.sub}
          </button>
        ) : (
          <span className="tl-action-sub">{state.sub}</span>
        )}
        {state.running && state.progress !== null && (
          <span className="ss-progress tl-action-progress" aria-hidden="true">
            <span
              className="ss-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, state.progress * 100))}%` }}
            />
          </span>
        )}
      </div>
      {state.running ? (
        <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={onCancel}>
          {t('timeline.action.cancel')}
        </button>
      ) : (
        <button
          type="button"
          className={`ss-btn ss-btn-sm ${state.ready ? 'ss-btn-primary' : 'ss-btn-secondary'} ss-btn-llm`}
          onClick={onRun}
          disabled={!state.ready}
          data-action={first ? 'story-order-run' : undefined}
        >
          {state.runLabel}
        </button>
      )}
    </div>
  );
}
