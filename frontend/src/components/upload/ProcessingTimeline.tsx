import { Check, X, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@/api/types';

type StepKey = 'pdfParsing' | 'languageDetect' | 'summarization' | 'featureExtraction' | 'knowledgeGraph' | 'symbolExploration' | 'dataStorage';

const STEPS: { key: StepKey; pct: number }[] = [
  { key: 'pdfParsing', pct: 5 },
  { key: 'languageDetect', pct: 10 },
  { key: 'summarization', pct: 20 },
  { key: 'featureExtraction', pct: 40 },
  { key: 'knowledgeGraph', pct: 60 },
  { key: 'symbolExploration', pct: 80 },
  { key: 'dataStorage', pct: 90 },
];

interface ProcessingTimelineProps {
  task: TaskStatus;
}

function stepState(stepIdx: number, task: TaskStatus): 'done' | 'running' | 'pending' | 'error' {
  const stepPct = STEPS[stepIdx].pct;
  const nextPct = STEPS[stepIdx + 1]?.pct ?? 100;

  if (task.status === 'done') return 'done';

  if (task.status === 'error') {
    if (task.progress < stepPct) return 'pending';
    if (task.progress >= nextPct) return 'done';
    return 'error';
  }

  if (task.progress < stepPct) return 'pending';
  if (task.progress >= nextPct) return 'done';
  return 'running';
}

function circleBg(state: 'done' | 'running' | 'pending' | 'error'): string {
  if (state === 'done') return 'var(--color-success)';
  if (state === 'running') return 'var(--color-warning)';
  if (state === 'error') return 'var(--color-error)';
  return 'var(--bg-tertiary)';
}

export function ProcessingTimeline({ task }: Readonly<ProcessingTimelineProps>) {
  const { t } = useTranslation('upload');

  return (
    <div className="flex flex-col gap-0">
      {STEPS.map((step, idx) => {
        const state = stepState(idx, task);
        const isLast = idx === STEPS.length - 1;
        const hasSubProgress = state === 'running' && task.subTotal != null;

        return (
          <div key={step.key} className="flex gap-3">
            {/* Vertical line + circle */}
            <div className="flex flex-col items-center">
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: circleBg(state),
                  color: state === 'pending' ? 'var(--fg-muted)' : 'white',
                }}
              >
                {state === 'done' && <Check size={12} />}
                {state === 'running' && <Loader size={12} className="animate-spin" />}
                {state === 'error' && <X size={12} />}
                {state === 'pending' && <span className="text-xs">{idx + 1}</span>}
              </div>
              {!isLast && (
                <div
                  className="flex-1"
                  style={{
                    width: 2,
                    minHeight: 20,
                    backgroundColor: state === 'done' ? 'var(--color-success)' : 'var(--border)',
                  }}
                />
              )}
            </div>

            {/* Label + sub-progress */}
            <div className="pb-4">
              <span
                className="text-xs font-medium"
                style={{
                  color: state === 'pending' ? 'var(--fg-muted)' : 'var(--fg-primary)',
                }}
              >
                {t(`steps.${step.key}`)}
              </span>

              {state === 'running' && (
                <div className="mt-1">
                  {hasSubProgress ? (
                    <>
                      <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                        {task.subStage ? `${task.subStage} ` : ''}{task.subProgress ?? 0} / {task.subTotal}
                      </span>
                      <div
                        className="mt-0.5 h-0.5 w-24 rounded overflow-hidden"
                        style={{ backgroundColor: 'var(--bg-tertiary)' }}
                      >
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${Math.round(((task.subProgress ?? 0) / task.subTotal!) * 100)}%`,
                            backgroundColor: 'var(--color-warning)',
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div
                      className="h-0.5 w-24 rounded overflow-hidden"
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    >
                      <div
                        className="h-full animate-pulse"
                        style={{ width: '40%', backgroundColor: 'var(--color-warning)' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {state === 'error' && task.error && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-error)' }}>
                  {task.error}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
