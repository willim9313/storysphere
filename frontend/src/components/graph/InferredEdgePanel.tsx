import { X, CheckCircle, XCircle, Loader } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchInferredRelations, confirmInferred, rejectInferred } from '@/api/graph';
import type { InferredRelation } from '@/api/graph';
import { useState } from 'react';

const RELATION_TYPES = [
  'family', 'friendship', 'romance', 'enemy', 'ally',
  'subordinate', 'located_in', 'member_of', 'owns', 'other',
];

interface InferredEdgePanelProps {
  bookId: string;
  inferredId: string;
  onClose: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
}

export function InferredEdgePanel({
  bookId,
  inferredId,
  onClose,
  onConfirmed,
  onRejected,
}: InferredEdgePanelProps) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState('friendship');

  const { data, isLoading } = useQuery({
    queryKey: ['books', bookId, 'inferred-relations'],
    queryFn: () => fetchInferredRelations(bookId, 'pending'),
  });

  const ir: InferredRelation | undefined = data?.items.find((i) => i.id === inferredId);

  const confirmMutation = useMutation({
    mutationFn: () => confirmInferred(bookId, inferredId, selectedType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'inferred-relations'] });
      onConfirmed();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectInferred(bookId, inferredId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'inferred-relations'] });
      onRejected();
    },
  });

  const isBusy = confirmMutation.isPending || rejectMutation.isPending;

  return (
    <div
      className="absolute right-4 top-4 z-20 rounded-lg p-4 space-y-3"
      style={{
        backgroundColor: 'white',
        border: '1px solid #f59e0b',
        boxShadow: 'var(--shadow-md)',
        width: 280,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: '#b45309' }}>
          推斷關係
        </span>
        <button onClick={onClose} style={{ color: 'var(--fg-muted)' }}>
          <X size={14} />
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader size={18} className="animate-spin" style={{ color: '#f59e0b' }} />
        </div>
      )}

      {!isLoading && !ir && (
        <p className="text-xs py-2" style={{ color: 'var(--fg-muted)' }}>
          找不到推斷關係
        </p>
      )}

      {ir && (
        <>
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-1.5">
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}
              >
                {ir.sourceName}
              </span>
              <span style={{ color: 'var(--fg-muted)' }}>↔</span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}
              >
                {ir.targetName}
              </span>
            </div>

            <div className="space-y-1 pt-1">
              <div className="flex justify-between">
                <span style={{ color: 'var(--fg-muted)' }}>共同鄰居</span>
                <span className="font-medium">{ir.commonNeighborCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--fg-muted)' }}>置信度</span>
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: 60, backgroundColor: '#e5e7eb' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(ir.confidence * 100)}%`,
                        backgroundColor: '#f59e0b',
                      }}
                    />
                  </div>
                  <span className="font-medium text-[11px]">
                    {Math.round(ir.confidence * 100)}%
                  </span>
                </div>
              </div>
            </div>

            <p
              className="text-[10px] pt-1 italic"
              style={{ color: 'var(--fg-muted)' }}
            >
              {ir.reasoning}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>
              確認為哪種關係？
            </p>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full text-xs rounded-md px-2 py-1"
              style={{
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--fg-primary)',
              }}
              disabled={isBusy}
            >
              {RELATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md transition-colors"
              style={{
                backgroundColor: isBusy ? '#e5e7eb' : '#dcfce7',
                color: isBusy ? '#9ca3af' : '#15803d',
              }}
              onClick={() => confirmMutation.mutate()}
              disabled={isBusy}
            >
              {confirmMutation.isPending ? (
                <Loader size={12} className="animate-spin" />
              ) : (
                <CheckCircle size={12} />
              )}
              確認
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md transition-colors"
              style={{
                backgroundColor: isBusy ? '#e5e7eb' : '#fee2e2',
                color: isBusy ? '#9ca3af' : '#dc2626',
              }}
              onClick={() => rejectMutation.mutate()}
              disabled={isBusy}
            >
              {rejectMutation.isPending ? (
                <Loader size={12} className="animate-spin" />
              ) : (
                <XCircle size={12} />
              )}
              否定
            </button>
          </div>
        </>
      )}
    </div>
  );
}
