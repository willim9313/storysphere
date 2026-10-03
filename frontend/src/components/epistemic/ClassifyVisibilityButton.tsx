/**
 * ClassifyVisibilityButton — triggers retroactive event visibility classification via LLM.
 *
 * TEMPORARY: This component exists to backfill visibility data for books ingested
 * before F-03. It may be replaced by a full re-ingest pipeline in the future.
 */
import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { triggerClassifyVisibility } from '@/api/graph';
import { isLlmUnconfigured } from '@/api/failureKind';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { Tooltip } from '@/components/ui/Tooltip';
import '@/styles/classify-visibility.css';

interface ClassifyVisibilityButtonProps {
  bookId: string;
  onComplete?: () => void;
}

export function ClassifyVisibilityButton({ bookId, onComplete }: ClassifyVisibilityButtonProps) {
  const { t } = useTranslation('reader');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The app's own 503 (no LLM provider) is a feature state: shown in place,
  // with the way to the LLM settings, instead of a generic failure line.
  const [unconfigured, setUnconfigured] = useState(false);

  const { data: task } = useTaskPolling(taskId);

  useEffect(() => {
    if (task?.status === 'done') {
      onComplete?.();
    }
  }, [task?.status, onComplete]);

  const handleClick = async () => {
    setError(null);
    setUnconfigured(false);
    try {
      const res = await triggerClassifyVisibility(bookId);
      setTaskId(res.taskId);
    } catch (e) {
      if (isLlmUnconfigured(e)) setUnconfigured(true);
      else setError(t('classify.triggerFailed'));
    }
  };

  const isPending = !!taskId && task?.status !== 'done' && task?.status !== 'error';
  const isDone = task?.status === 'done';
  const isFailed = task?.status === 'error';

  if (isDone) {
    const result = task.result as { classified?: number; total?: number } | undefined;
    return (
      <span className="cvb-done">
        <CheckCircle size={11} />
        {t('classify.done', { classified: result?.classified ?? '?', total: result?.total ?? '?' })}
      </span>
    );
  }

  if (unconfigured) return <LlmUnconfiguredNotice />;

  return (
    <div className="cvb">
      {/* A disabled control swallows mouse events, so the Tooltip wraps it. */}
      <Tooltip label={t('classify.tooltip')}>
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
        >
          {isPending
            ? (task?.stage ? `${task.stage}…` : t('classify.running'))
            : `${t('classify.label')}${t('classify.temp')}`}
        </button>
      </Tooltip>
      <p className="cvb-hint">{t('classify.hint')}</p>
      {(isFailed || error) && (
        <span className="cvb-error">
          <AlertTriangle size={10} />
          {error ?? task?.error ?? t('classify.failed')}
        </span>
      )}
    </div>
  );
}
