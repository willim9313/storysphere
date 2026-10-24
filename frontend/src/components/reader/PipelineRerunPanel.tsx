import { useState } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import type { PipelineStatus } from '@/api/types';
import { rerunStep, fetchTaskStatus } from '@/api/ingest';
import type { RerunStep } from '@/api/ingest';
import { isLlmUnconfigured } from '@/api/failureKind';
import { isCancelled } from '@/api/tasks';
import { isGone } from '@/hooks/useTaskPolling';
import { qk } from '@/api/queryKeys';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type StepKey = 'summarization' | 'featureExtraction' | 'knowledgeGraph' | 'symbolDiscovery';

interface StepDef {
  key: keyof PipelineStatus;
  step: RerunStep;
  /** i18n key under `rerun.steps`. */
  label: StepKey;
}

const STEPS: StepDef[] = [
  { key: 'summarization', step: 'summarization', label: 'summarization' },
  { key: 'featureExtraction', step: 'feature-extraction', label: 'featureExtraction' },
  { key: 'knowledgeGraph', step: 'knowledge-graph', label: 'knowledgeGraph' },
  { key: 'symbolDiscovery', step: 'symbol-discovery', label: 'symbolDiscovery' },
];

interface StepRowProps {
  def: StepDef;
  status: string;
  bookId: string;
  onComplete: () => void;
}

function StepRow({ def, status, bookId, onComplete }: Readonly<StepRowProps>) {
  const { t } = useTranslation('reader');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The app's own 503 (no LLM provider): a feature state, not a failure — it
  // is shown in place and the rest of the page stays as it was.
  const [unconfigured, setUnconfigured] = useState(false);
  // Rerun spends tokens and overwrites the step's output — confirm first.
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Another rerun (or concept inference) is going for this book: the backend
  // holds one lock for them (#19c) and refused this one with 409. Not a
  // failure — the build overview shows which run it is.
  const [busy, setBusy] = useState(false);

  const handleRerun = async () => {
    setRunning(true);
    setError(null);
    setUnconfigured(false);
    setBusy(false);

    let taskId: string;
    try {
      ({ taskId } = await rerunStep(bookId, def.step));
    } catch (e) {
      if (isLlmUnconfigured(e)) {
        setUnconfigured(true);
      } else if (e instanceof ApiError && e.status === 409 && e.code === 'batch_running') {
        setBusy(true);
      } else {
        setError(e instanceof Error ? e.message : t('rerun.failed'));
      }
      setRunning(false);
      return;
    }

    // Poll until done
    const poll = async (): Promise<void> => {
      const s = await fetchTaskStatus(taskId);
      if (s.status === 'done') {
        onComplete();
        return;
      }
      if (s.status === 'error') {
        setRunning(false);
        // Cancelling is the user's own choice, not a failed run; the step's
        // status may still have moved, so refetch the book either way.
        if (isCancelled(s)) onComplete();
        else setError(s.error ?? t('rerun.failed'));
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
      return poll();
    };
    try {
      await poll();
    } catch (e) {
      setRunning(false);
      // 404: the task is gone (memory store restarted, or cleaned up). There
      // is no outcome to report; refetch the book and offer the step again.
      if (isGone(e)) onComplete();
      else setError(e instanceof Error ? e.message : t('rerun.failed'));
    }
  };

  const label = t(`rerun.steps.${def.label}`);

  if (status === 'done') {
    return (
      <div className="rd-rerun-row">
        <div className="rd-rerun-line">
          <span>{label}</span>
          <span className="rd-rerun-done">
            <CheckCircle size={14} />
          </span>
        </div>
      </div>
    );
  }

  if (status === 'pending') return null;

  return (
    <div className="rd-rerun-row is-failed">
      <div className="rd-rerun-line">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={running}
          className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
        >
          {running ? t('rerun.running') : t('rerun.rerun')}
        </button>
      </div>
      {error && <span className="rd-rerun-error">{error}</span>}
      {busy && (
        <p className="rd-rerun-hint" role="status">
          {t('rerun.busy')}{' '}
          <Link to={`/books/${bookId}/unraveling`}>{t('unanalyzed.cta')}</Link>
        </p>
      )}
      {unconfigured && <LlmUnconfiguredNotice />}
      <ConfirmDialog
        open={confirmOpen}
        title={label}
        message={t('rerun.confirmBody', { step: label })}
        confirmLabel={t('rerun.rerun')}
        costHint={t('rerun.costHint')}
        spendsTokens
        onConfirm={() => {
          setConfirmOpen(false);
          void handleRerun();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

interface PipelineRerunPanelProps {
  bookId: string;
  pipelineStatus: PipelineStatus;
}

export function PipelineRerunPanel({ bookId, pipelineStatus }: Readonly<PipelineRerunPanelProps>) {
  const { t } = useTranslation('reader');
  const queryClient = useQueryClient();
  const failedSteps = STEPS.filter((s) => pipelineStatus[s.key] === 'failed');

  if (failedSteps.length === 0) return null;

  const handleComplete = () => {
    void queryClient.invalidateQueries({ queryKey: qk.book(bookId) });
  };

  return (
    <div className="rd-rerun">
      <div className="rd-rerun-title">
        <AlertTriangle size={14} />
        <span>{t('rerun.title')}</span>
      </div>
      <div className="rd-rerun-rows">
        {STEPS.map((def) => (
          <StepRow
            key={def.key}
            def={def}
            status={pipelineStatus[def.key]}
            bookId={bookId}
            onComplete={handleComplete}
          />
        ))}
      </div>
      <p className="rd-rerun-hint">{t('rerun.hint')}</p>
    </div>
  );
}
