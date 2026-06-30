import { Fragment } from 'react';
import { CheckCircle2, ChevronRight, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

export interface TensionStepSpec {
  key: 1 | 2 | 3;
  label: string;
  scope: string;
  desc: string;
  done: boolean;
  running: boolean;
  active: boolean;
  disabled?: boolean;
  progress?: number;
  error?: string | null;
}

interface Props {
  steps: TensionStepSpec[];
  onTrigger: (key: 1 | 2 | 3) => void;
}

export function TensionStepperStrip({ steps, onTrigger }: Props) {
  return (
    <div className="tn-stepper">
      {steps.map((s) => (
        <Fragment key={s.key}>
          <TensionStep step={s} onClick={() => !s.disabled && !s.running && onTrigger(s.key)} />
          {s.error && (
            <div className="tn-step-error">
              <AlertTriangle size={12} />
              <span>{s.error}</span>
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function TensionStep({ step, onClick }: { step: TensionStepSpec; onClick: () => void }) {
  const cls = [
    'tn-step',
    step.done && 'is-done',
    step.running && 'is-running',
    step.active && 'is-active',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={cls} onClick={onClick} disabled={step.disabled || step.running}>
      <span className="tn-step-num">
        {step.running ? (
          <Loader2 size={14} className="tn-spin" />
        ) : step.done ? (
          <CheckCircle2 size={14} />
        ) : (
          step.key
        )}
      </span>
      <div className="tn-step-body">
        <div className="tn-step-aggr">{step.scope}</div>
        <div className="tn-step-label">{step.label}</div>
        <div className="tn-step-desc">{step.desc}</div>
      </div>
      <span className={`tn-step-cta ${step.done ? 'tn-step-cta-done' : ''}`}>
        {step.running ? null : step.done ? (
          <RefreshCw size={12} />
        ) : step.disabled ? null : (
          <ChevronRight size={14} />
        )}
      </span>
      {step.running && (
        <div className="tn-step-progress">
          <div className="tn-step-progress-fill" style={{ width: `${step.progress ?? 0}%` }} />
        </div>
      )}
    </button>
  );
}
