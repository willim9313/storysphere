import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import type { EntityResponse } from '@/api/types';
import { useCharacterAnalysis } from '@/hooks/useCharacterAnalysis';
import { AnalysisStatusBadge } from './AnalysisStatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface CharacterAnalysisCardProps {
  entity: EntityResponse;
  documentId: string;
}

export function CharacterAnalysisCard({ entity, documentId }: CharacterAnalysisCardProps) {
  const { trigger, status, result, error, isTriggering } = useCharacterAnalysis();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  const handleTrigger = (force: boolean) => {
    setForceRefresh(force);
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    trigger({
      entity_name: entity.name,
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
          {'profile' in analysisResult && analysisResult.profile ? (
            <section>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Profile
              </h4>
              <MarkdownRenderer content={String(analysisResult.profile)} />
            </section>
          ) : null}
          {'archetypes' in analysisResult && analysisResult.archetypes ? (
            <section>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Archetypes
              </h4>
              <MarkdownRenderer content={String(analysisResult.archetypes)} />
            </section>
          ) : null}
          {'arc' in analysisResult && analysisResult.arc ? (
            <section>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Character Arc
              </h4>
              <MarkdownRenderer content={String(analysisResult.arc)} />
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
        title="Run Character Analysis"
        description={`Analyze "${entity.name}"? This may take a moment.`}
        confirmLabel="Analyze"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
