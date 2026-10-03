import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@/api/types';
import { deriveStages, type StageState } from './symbolViewModel';

interface Props {
  task: TaskStatus | undefined;
  term: string;
  // Total occurrence count for this symbol. Surfaced as the "N/N" in the
  // 採樣段落脈絡 step because the backend's `assemble_sep` builds one
  // SEPOccurrenceContext per imagery occurrence (i.e. count == entity.frequency).
  // See the note in `symbols.css` for design rationale.
  occurrenceCount?: number;
  onCancel?: () => void;
  /** The cancel request is in flight; the button waits rather than double-sending. */
  cancelling?: boolean;
  /** The cancel request failed, so the run is still going. */
  cancelFailed?: boolean;
}

const STAGE_BADGE: Record<StageState, string> = {
  done: 'ss-badge ss-badge-success',
  running: 'ss-badge ss-badge-info',
  pending: 'ss-badge sym-gen-badge-pending',
};

export function InterpretationGenerating({
  task,
  term,
  occurrenceCount,
  onCancel,
  cancelling = false,
  cancelFailed = false,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const pct = Math.max(0, Math.min(100, task?.progress ?? 0));
  const stages = deriveStages(pct, occurrenceCount);
  const taskIdShort = task?.taskId ? task.taskId.slice(0, 8) : '—';

  const stateLabel: Record<StageState, string> = {
    done: t('symbol.generating.stageDone'),
    running: t('symbol.generating.stageRunning'),
    pending: t('symbol.generating.stagePending'),
  };

  return (
    <section className="sym-gen">
      <div className="sym-gen-card">
        <div className="sym-gen-head">
          <div className="sym-gen-titles">
            <h2 className="sym-gen-title">{t('symbol.generating.eyebrow')}</h2>
            <span className="sym-gen-term">「{term}」</span>
          </div>
          <div className="sym-gen-task">
            <span className="sym-gen-task-label">{t('symbol.generating.taskLabel')}</span>
            <span className="sym-gen-task-id">{taskIdShort}</span>
          </div>
        </div>

        <div className="sym-gen-progress">
          <div className="sym-gen-progress-meta">
            <span>{t('symbol.generating.overallProgress')}</span>
            <span className="sym-gen-progress-pct">{pct}%</span>
          </div>
          <div className="ss-progress">
            <div className="ss-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <ul className="sym-gen-stages">
          {stages.map((s) => (
            <li key={s.key} className={`sym-gen-stage is-${s.state}`}>
              <span className="sym-gen-stage-label">
                {s.key === 'context'
                  ? t('symbol.generating.stages.context', {
                      done: s.count ?? '?',
                      total: s.count ?? '?',
                    })
                  : t(`symbol.generating.stages.${s.key}`)}
              </span>
              <span className="sym-gen-stage-state">
                {s.state === 'running' && s.key === 'llm' && (
                  <span className="sym-gen-stage-pct">{s.pct}%</span>
                )}
                <span className={STAGE_BADGE[s.state]}>{stateLabel[s.state]}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="sym-gen-foot">
          <span className="sym-gen-foot-note">{t('symbol.generating.footerNote')}</span>
          {onCancel && (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary"
              onClick={onCancel}
              disabled={cancelling}
            >
              {t('symbol.generating.cancel')}
            </button>
          )}
        </div>
        {cancelFailed && (
          <p className="sym-gen-cancel-failed" role="alert">
            {t('symbol.generating.cancelFailed')}
          </p>
        )}
      </div>
    </section>
  );
}
