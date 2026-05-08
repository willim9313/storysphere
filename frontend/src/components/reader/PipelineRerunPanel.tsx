import { useState } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { PipelineStatus } from '@/api/types';
import { rerunStep, fetchTaskStatus } from '@/api/ingest';
import type { RerunStep } from '@/api/ingest';

interface StepDef {
  key: keyof PipelineStatus;
  step: RerunStep;
  label: string;
}

const STEPS: StepDef[] = [
  { key: 'summarization', step: 'summarization', label: '章節摘要' },
  { key: 'featureExtraction', step: 'feature-extraction', label: '特徵萃取' },
  { key: 'knowledgeGraph', step: 'knowledge-graph', label: '知識圖譜' },
  { key: 'symbolDiscovery', step: 'symbol-discovery', label: '符號探索' },
];

interface StepRowProps {
  def: StepDef;
  status: string;
  bookId: string;
  onComplete: () => void;
}

function StepRow({ def, status, bookId, onComplete }: Readonly<StepRowProps>) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRerun = async () => {
    setRunning(true);
    setError(null);
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
          setError(s.error ?? '執行失敗');
          setRunning(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
        return poll();
      };
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '執行失敗');
      setRunning(false);
    }
  };

  if (status === 'done') {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>{def.label}</span>
        <CheckCircle size={13} style={{ color: 'var(--color-success, #16a34a)' }} />
      </div>
    );
  }

  if (status === 'pending') return null;

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <AlertTriangle size={12} style={{ color: 'var(--color-warning, #d97706)', flexShrink: 0 }} />
        <span className="text-xs truncate" style={{ color: 'var(--fg-secondary)' }}>{def.label}</span>
        {error && <span className="text-xs truncate" style={{ color: 'var(--color-error, #dc2626)' }}>{error}</span>}
      </div>
      <button
        onClick={handleRerun}
        disabled={running}
        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
        style={{
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--fg-secondary)',
          cursor: running ? 'not-allowed' : 'pointer',
          opacity: running ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        <RefreshCw size={11} className={running ? 'animate-spin' : ''} />
        {running ? '執行中' : '重新執行'}
      </button>
    </div>
  );
}

interface PipelineRerunPanelProps {
  bookId: string;
  pipelineStatus: PipelineStatus;
}

export function PipelineRerunPanel({ bookId, pipelineStatus }: Readonly<PipelineRerunPanelProps>) {
  const queryClient = useQueryClient();
  const failedSteps = STEPS.filter((s) => pipelineStatus[s.key] === 'failed');

  if (failedSteps.length === 0) return null;

  const handleComplete = () => {
    void queryClient.invalidateQueries({ queryKey: ['book', bookId] });
  };

  return (
    <div className="rounded-md p-3" style={{ border: '1px solid var(--color-warning, #d97706)', backgroundColor: 'var(--bg-secondary)' }}>
      <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>
        功能未完成
      </h3>
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
  );
}
