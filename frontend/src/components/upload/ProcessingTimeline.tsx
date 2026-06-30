import { Check, X, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@/api/types';

type StepKey =
  | 'pdfParsing'
  | 'languageDetect'
  | 'summarization'
  | 'featureExtraction'
  | 'knowledgeGraph'
  | 'symbolExploration'
  | 'dataStorage';

const STEPS: { key: StepKey; pct: number }[] = [
  { key: 'pdfParsing',        pct: 5  },
  { key: 'languageDetect',    pct: 10 },
  { key: 'summarization',     pct: 20 },
  { key: 'featureExtraction', pct: 40 },
  { key: 'knowledgeGraph',    pct: 60 },
  { key: 'symbolExploration', pct: 80 },
  { key: 'dataStorage',       pct: 90 },
];

interface ProcessingTimelineProps {
  task: TaskStatus;
}

function stepState(stepIdx: number, task: TaskStatus): 'done' | 'running' | 'pending' | 'error' {
  const stepPct  = STEPS[stepIdx].pct;
  const nextPct  = STEPS[stepIdx + 1]?.pct ?? 100;

  if (task.status === 'done') return 'done';

  if (task.status === 'error') {
    if (task.progress < stepPct)  return 'pending';
    if (task.progress >= nextPct) return 'done';
    return 'error';
  }

  if (task.progress < stepPct)  return 'pending';
  if (task.progress >= nextPct) return 'done';
  return 'running';
}

export function ProcessingTimeline({ task }: Readonly<ProcessingTimelineProps>) {
  const { t } = useTranslation('upload');

  return (
    <div className="ss-steps">
      {STEPS.map((step, idx) => {
        const state = stepState(idx, task);
        const hasSubProgress = state === 'running' && task.subTotal != null;

        const cls =
          state === 'done'    ? 'ss-step ss-step-done' :
          state === 'running' ? 'ss-step ss-step-active' :
          'ss-step';

        return (
          <div key={step.key} className={cls}>
            <div
              className="ss-step-marker"
              style={state === 'error' ? {
                backgroundColor: 'var(--color-error)',
                borderColor:     'var(--color-error)',
                color:           'var(--bg-primary)',
              } : undefined}
            >
              {state === 'done'    && <Check  size={12} strokeWidth={2.5} />}
              {state === 'running' && <Loader size={13} strokeWidth={2} className="animate-spin" />}
              {state === 'error'   && <X      size={12} />}
              {state === 'pending' && <span>{idx + 1}</span>}
            </div>

            <div className="ss-step-content">
              <span className="ss-step-label">{t(`steps.${step.key}`)}</span>

              {state === 'running' && (
                hasSubProgress ? (
                  <span className="ss-step-sub">
                    {task.subStage ? `${task.subStage} ` : ''}
                    {task.subProgress ?? 0}&nbsp;/&nbsp;{task.subTotal}
                  </span>
                ) : (
                  <div
                    className="mt-1 h-0.5 w-16 rounded overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                  >
                    <div
                      className="h-full animate-pulse"
                      style={{ width: '40%', backgroundColor: 'var(--accent)' }}
                    />
                  </div>
                )
              )}

              {state === 'error' && task.error && (
                <span className="ss-step-sub" style={{ color: 'var(--color-error)' }}>
                  {task.error}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
