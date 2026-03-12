import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import type { EntityResponse } from '@/api/types';
import { useEventAnalysis } from '@/hooks/useEventAnalysis';
import { AnalysisStatusBadge } from './AnalysisStatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface EventAnalysisCardProps {
  entity: EntityResponse;
  documentId: string;
}

export function EventAnalysisCard({ entity, documentId }: EventAnalysisCardProps) {
  const { trigger, status, result, error, isTriggering } = useEventAnalysis();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  const handleTrigger = (force: boolean) => {
    setForceRefresh(force);
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    trigger({
      event_id: entity.id,
      document_id: documentId,
      force_refresh: forceRefresh,
    });
  };

  const analysisResult = result as Record<string, unknown> | null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-serif)' }}>
          {entity.name}
        </h3>
        <AnalysisStatusBadge status={status ?? 'idle'} />
      </div>

      {entity.description && (
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          {entity.description}
        </p>
      )}

      {error && <ErrorMessage message={error} />}

      {analysisResult != null && (
        <div className="mt-4 space-y-4">
          {'summary' in analysisResult && analysisResult.summary ? (
            <section>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Summary
              </h4>
              <MarkdownRenderer content={String(analysisResult.summary)} />
            </section>
          ) : null}
          {'causality' in analysisResult && analysisResult.causality ? (
            <section>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Causality
              </h4>
              <MarkdownRenderer content={String(analysisResult.causality)} />
            </section>
          ) : null}
          {'impact' in analysisResult && analysisResult.impact ? (
            <section>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Impact
              </h4>
              <MarkdownRenderer content={String(analysisResult.impact)} />
            </section>
          ) : null}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {!status || status === 'failed' ? (
          <button
            className="btn btn-primary"
            onClick={() => handleTrigger(false)}
            disabled={isTriggering}
          >
            <Sparkles size={14} />
            Generate Analysis
          </button>
        ) : status === 'completed' ? (
          <button
            className="btn btn-secondary"
            onClick={() => handleTrigger(true)}
            disabled={isTriggering}
          >
            <RefreshCw size={14} />
            Regenerate
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Run Event Analysis"
        description={`Analyze "${entity.name}"? This may take a moment.`}
        confirmLabel="Analyze"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
