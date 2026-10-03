import { useState } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PipelineStatus } from '@/api/types';
import { rerunStep, fetchTaskStatus } from '@/api/ingest';
import type { RerunStep } from '@/api/ingest';
import { isLlmUnconfigured } from '@/api/failureKind';
import { qk } from '@/api/queryKeys';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';

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

  const handleRerun = async () => {
    setRunning(true);
    setError(null);
    setUnconfigured(false);
    try {
      const { taskId } = await rerunStep(bookId, def.step);
      // Poll until done
      const poll = async (): Promise<void> => {
        const s = await fetchTaskStatus(taskId);
        if (s.status === 'done') {
          onComplete();
          return;
        }
        if (s.status === 'error') {
          setError(s.error ?? t('rerun.failed'));
          setRunning(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
        return poll();
      };
      await poll();
    } catch (e) {
      if (isLlmUnconfigured(e)) {
        setUnconfigured(true);
      } else {
        setError(e instanceof Error ? e.message : t('rerun.failed'));
      }
      setRunning(false);
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
          onClick={handleRerun}
          disabled={running}
          className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
        >
          {running ? t('rerun.running') : t('rerun.rerun')}
        </button>
      </div>
      {error && <span className="rd-rerun-error">{error}</span>}
      {unconfigured && <LlmUnconfiguredNotice />}
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
