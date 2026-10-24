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

// Seven steps and their progress anchors are a fixed contract (spec §6).
const STEPS: { key: StepKey; pct: number }[] = [
  { key: 'pdfParsing',        pct: 5  },
  { key: 'languageDetect',    pct: 10 },
  { key: 'summarization',     pct: 20 },
  { key: 'featureExtraction', pct: 40 },
  { key: 'knowledgeGraph',    pct: 60 },
  { key: 'symbolExploration', pct: 80 },
  { key: 'dataStorage',       pct: 90 },
];

type StepState = 'done' | 'running' | 'pending' | 'error';

interface ProcessingTimelineProps {
  task: TaskStatus;
}

function stepState(stepIdx: number, task: TaskStatus): StepState {
  if (task.status === 'done') return 'done';

  // Prefer the machine-readable step key sent by the backend; the
  // progress-range mapping below only covers tasks without one.
  const keyIdx = task.stepKey ? STEPS.findIndex((s) => s.key === task.stepKey) : -1;
  if (keyIdx >= 0) {
    if (stepIdx < keyIdx) return 'done';
    if (stepIdx > keyIdx) return 'pending';
    return task.status === 'error' ? 'error' : 'running';
  }

  const stepPct  = STEPS[stepIdx].pct;
  const nextPct  = STEPS[stepIdx + 1]?.pct ?? 100;

  if (task.status === 'error') {
    if (task.progress < stepPct)  return 'pending';
    if (task.progress >= nextPct) return 'done';
    return 'error';
  }

  if (task.progress < stepPct)  return 'pending';
  if (task.progress >= nextPct) return 'done';
  return 'running';
}

// Shape only; the state is spoken by the label's sr-only text instead.
function Marker({ state, n }: Readonly<{ state: StepState; n: number }>) {
  if (state === 'done') return <span className="up-marker up-marker-done" aria-hidden="true"><Check size={12} strokeWidth={2} /></span>;
  if (state === 'error') return <span className="up-marker up-marker-error" aria-hidden="true"><X size={12} strokeWidth={2} /></span>;
  if (state === 'running') {
    return (
      <span className="up-marker up-marker-running" aria-hidden="true">
        <Loader size={14} strokeWidth={1.5} className="up-spin" />
      </span>
    );
  }
  return <span className="up-marker up-marker-pending" aria-hidden="true">{n}</span>;
}

export function ProcessingTimeline({ task }: Readonly<ProcessingTimelineProps>) {
  const { t } = useTranslation('upload');

  return (
    <div className="up-steps">
      {STEPS.map((step, idx) => {
        const state = stepState(idx, task);
        return (
          <div key={step.key} className="up-step" data-state={state} aria-current={state === 'running' ? 'step' : undefined}>
            <div className="up-step-row">
              <Marker state={state} n={idx + 1} />
              <span className="up-step-label">
                {t(`steps.${step.key}`)}
                <span className="sr-only">{t(`stepState.${state}`)}</span>
              </span>
              {/* An anchor on the overall bar, not this step's completion —
                  read aloud it would be heard as the latter. */}
              <span className="up-step-pct" aria-hidden="true">{step.pct}%</span>
            </div>
            {/* Real sub-progress only: without subTotal the spinner already says
                "still running" — a fake bar would be read as progress. */}
            {state === 'running' && task.subTotal != null && (
              <span className="up-step-sub">
                {task.subStage ? `${task.subStage} ` : ''}
                {task.subProgress ?? 0} / {task.subTotal}
              </span>
            )}
            {state === 'error' && task.error && <code className="up-code">{task.error}</code>}
          </div>
        );
      })}
    </div>
  );
}
