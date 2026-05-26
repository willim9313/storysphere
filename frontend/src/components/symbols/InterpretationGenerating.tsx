import { Sparkles, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@/api/types';

interface Props {
  task: TaskStatus | undefined;
  term: string;
  // Total occurrence count for this symbol. Surfaced as the "N/N" in the
  // 採樣段落脈絡 step because the backend's `assemble_sep` builds one
  // SEPOccurrenceContext per imagery occurrence (i.e. count == entity.frequency).
  // See the note in `symbols.css` for design rationale.
  occurrenceCount?: number;
  onCancel?: () => void;
}

type StageState = 'done' | 'running' | 'pending';

interface Stage {
  key: 'sep' | 'context' | 'link' | 'llm' | 'review';
  state: StageState;
  pct?: number;
  count?: number;
}

/**
 * Derive 5 UI stages from the backend's 3 real progress events.
 *
 * Backend pipeline (src/services/symbol_analysis_service.py:115-130) emits
 * exactly three progress callbacks:
 *   10 → "loading SEP"
 *   40 → "calling LLM for interpretation"
 *   90 → "saving interpretation"
 *
 * The design splits the first phase (assemble_sep) into 3 narrative sub-steps
 * for UX clarity, even though they happen inside one atomic in-memory call:
 *   1. 彙整 SEP 證據檔
 *   2. 採樣段落脈絡 (N/N)
 *   3. 連結 KG 角色 / 事件
 * These three are treated as a single block in the UI: pending until progress
 * reaches 10, then all marked done together. The N/N counter shows the symbol's
 * total occurrence count (not a live counter) because that's what `assemble_sep`
 * actually packs into the SEP — the loop runs to completion before progress=40
 * fires.
 *
 * Steps 4 and 5 map cleanly to the remaining two progress events:
 *   4. LLM 詮釋 · 生成主題命題  (progress 10 → 90)
 *   5. 寫入待審紀錄              (progress 90 → 100)
 */
function deriveStages(progress: number, occurrenceCount?: number): Stage[] {
  const sepDone = progress >= 10;
  const llmDone = progress >= 90;
  const reviewDone = progress >= 100;

  const sepState: StageState = sepDone ? 'done' : 'running';
  let llmState: StageState = 'pending';
  if (llmDone) llmState = 'done';
  else if (sepDone) llmState = 'running';
  let reviewState: StageState = 'pending';
  if (reviewDone) reviewState = 'done';
  else if (llmDone) reviewState = 'running';

  // Map backend's 10–90 range to a 0–100 progress for the LLM step display.
  const llmPct =
    llmState === 'running' ? Math.max(0, Math.min(100, Math.round(((progress - 10) / 80) * 100))) : 0;

  return [
    { key: 'sep', state: sepState },
    { key: 'context', state: sepState, count: occurrenceCount },
    { key: 'link', state: sepState },
    { key: 'llm', state: llmState, pct: llmPct },
    { key: 'review', state: reviewState },
  ];
}

export function InterpretationGenerating({ task, term, occurrenceCount, onCancel }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const pct = Math.max(0, Math.min(100, task?.progress ?? 0));
  const stages = deriveStages(pct, occurrenceCount);
  const taskIdShort = task?.taskId ? task.taskId.slice(0, 8) : '—';

  return (
    <section className="sym-gen">
      <div className="sym-gen-card">
        <div className="sym-gen-head">
          <div className="sym-gen-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="sym-gen-eye">{t('symbol.generating.eyebrow')}</div>
            <h2 className="sym-gen-title">「{term}」</h2>
          </div>
          <div className="sym-gen-task">
            <span className="sym-gen-task-label">{t('symbol.generating.taskLabel')}</span>
            <span className="sym-gen-task-id">{taskIdShort}</span>
          </div>
        </div>

        <div className="sym-gen-progress">
          <div className="sym-gen-progress-bar">
            <div className="sym-gen-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="sym-gen-progress-meta">
            <span>{t('symbol.generating.overallProgress')}</span>
            <span className="sym-gen-progress-pct">{pct}%</span>
          </div>
        </div>

        <ul className="sym-gen-stages">
          {stages.map((s) => (
            <li key={s.key} className={`sym-gen-stage is-${s.state}`}>
              <span className="sym-gen-stage-bullet">
                {s.state === 'done' && <Check size={11} strokeWidth={3} />}
                {s.state === 'running' && <span className="sym-gen-spinner" />}
                {s.state === 'pending' && <span className="sym-gen-stage-dot" />}
              </span>
              <span className="sym-gen-stage-label">
                {s.key === 'context'
                  ? t('symbol.generating.stages.context', {
                      done: s.count ?? '?',
                      total: s.count ?? '?',
                    })
                  : t(`symbol.generating.stages.${s.key}`)}
              </span>
              {s.state === 'done' && (
                <span className="sym-gen-stage-pct sym-gen-stage-pct-done">
                  {t('symbol.generating.stageDone')}
                </span>
              )}
              {s.state === 'running' && s.key === 'llm' && (
                <span className="sym-gen-stage-pct">{s.pct}%</span>
              )}
              {s.state === 'pending' && (
                <span className="sym-gen-stage-pct sym-gen-stage-pct-pending">
                  {t('symbol.generating.stagePending')}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="sym-gen-foot">
          <span className="sym-gen-foot-note">{t('symbol.generating.footerNote')}</span>
          {onCancel && (
            <button type="button" className="sym-btn-ghost" onClick={onCancel}>
              <X size={11} /> {t('symbol.generating.cancel')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
