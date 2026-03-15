import { Check, X, Loader } from 'lucide-react';
import type { TaskStatus } from '@/api/types';

const STEPS = [
  'PDF 解析',
  '章節切分',
  'Chunk 處理',
  '知識圖譜',
  '摘要生成',
];

interface ProcessingTimelineProps {
  task: TaskStatus;
}

function stepState(stepIdx: number, task: TaskStatus): 'done' | 'running' | 'pending' | 'error' {
  if (task.status === 'error') {
    const errorStep = Math.floor((task.progress / 100) * STEPS.length);
    if (stepIdx < errorStep) return 'done';
    if (stepIdx === errorStep) return 'error';
    return 'pending';
  }
  if (task.status === 'done') return 'done';

  const currentStep = Math.floor((task.progress / 100) * STEPS.length);
  if (stepIdx < currentStep) return 'done';
  if (stepIdx === currentStep) return 'running';
  return 'pending';
}

export function ProcessingTimeline({ task }: ProcessingTimelineProps) {
  return (
    <div className="flex flex-col gap-0">
      {STEPS.map((name, idx) => {
        const state = stepState(idx, task);
        const isLast = idx === STEPS.length - 1;

        return (
          <div key={name} className="flex gap-3">
            {/* Vertical line + circle */}
            <div className="flex flex-col items-center">
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor:
                    state === 'done' ? 'var(--color-success)'
                    : state === 'running' ? 'var(--color-warning)'
                    : state === 'error' ? 'var(--color-error)'
                    : 'var(--bg-tertiary)',
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

            {/* Label */}
            <div className="pb-4">
              <span
                className="text-xs font-medium"
                style={{
                  color: state === 'pending' ? 'var(--fg-muted)' : 'var(--fg-primary)',
                }}
              >
                {name}
              </span>
              {state === 'running' && (
                <div className="mt-1 h-0.5 w-24 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${task.progress % 20 * 5}%`,
                      backgroundColor: 'var(--color-warning)',
                    }}
                  />
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
