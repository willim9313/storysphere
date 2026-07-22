import { useMemo } from 'react';
import { X, Check, XOctagon, Loader, GitCompareArrows } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  confirmInferred,
  fetchInferredRelations,
  rejectInferred,
} from '@/api/graph';
import type { InferredRelation } from '@/api/graph';
import type { GraphNode } from '@/api/types';

interface EntityComparePanelProps {
  bookId: string;
  a: GraphNode;
  b: GraphNode;
  onClose: () => void;
  onEnterPairMode?: () => void;
}

export function EntityComparePanel({ bookId, a, b, onClose, onEnterPairMode }: EntityComparePanelProps) {
  const { t } = useTranslation('graph');
  const queryClient = useQueryClient();

  const { data: inferredData } = useQuery({
    queryKey: ['books', bookId, 'inferred-relations'],
    queryFn: () => fetchInferredRelations(bookId, 'pending'),
  });

  const suggested = useMemo(() => {
    if (!inferredData) return [] as InferredRelation[];
    return inferredData.items
      .filter(
        (ir) =>
          (ir.sourceId === a.id && ir.targetId === b.id) ||
          (ir.sourceId === b.id && ir.targetId === a.id),
      )
      .slice(0, 3);
  }, [inferredData, a.id, b.id]);

  const adopt = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) =>
      confirmInferred(bookId, id, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'inferred-relations'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] });
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectInferred(bookId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'inferred-relations'] });
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'graph'] });
    },
  });

  return (
    <div
      className="absolute top-0 right-0 h-full z-20 flex flex-col"
      style={{
        width: 560,
        backgroundColor: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      <header
        className="flex items-center justify-between p-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h3
          className="font-semibold"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', color: 'var(--fg-primary)' }}
        >
          {t('v1.compare.title')}
        </h3>
        <button onClick={onClose} style={{ color: 'var(--fg-muted)' }}>
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {onEnterPairMode && (
          <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={onEnterPairMode}
              className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--bg-primary)',
              }}
            >
              <GitCompareArrows size={13} />
              {t('v1.pair.enter')}
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 divide-x" style={{ borderColor: 'var(--border)' }}>
          <EntityColumn node={a} otherType={b.type} otherCount={b.chunkCount} />
          <EntityColumn node={b} otherType={a.type} otherCount={a.chunkCount} />
        </div>

        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <SectionLabel>{t('v1.compare.suggested')}</SectionLabel>
          {suggested.length === 0 ? (
            <p className="text-xs mt-1.5" style={{ color: 'var(--fg-muted)' }}>
              {t('v1.compare.noSuggested')}
            </p>
          ) : (
            <ul className="space-y-2 mt-2">
              {suggested.map((ir) => {
                const busyId = adopt.variables?.id === ir.id || reject.variables === ir.id;
                return (
                  <li
                    key={ir.id}
                    className="rounded-md p-2.5"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}
                      >
                        {ir.suggestedRelationType}
                      </span>
                      <span
                        className="tabular-nums ml-auto"
                        style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}
                      >
                        {(ir.confidence ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={busyId}
                        onClick={() =>
                          adopt.mutate({ id: ir.id, type: ir.suggestedRelationType })
                        }
                        className="flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded-md"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--bg-primary)',
                          opacity: busyId ? 0.6 : 1,
                        }}
                      >
                        {busyId && adopt.isPending ? (
                          <Loader size={11} className="animate-spin" />
                        ) : (
                          <Check size={11} />
                        )}
                        {t('v1.inferred.review.adopt')}
                      </button>
                      <button
                        disabled={busyId}
                        onClick={() => reject.mutate(ir.id)}
                        className="flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded-md"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--fg-secondary)',
                          border: '1px solid var(--border)',
                          opacity: busyId ? 0.6 : 1,
                        }}
                      >
                        {busyId && reject.isPending ? (
                          <Loader size={11} className="animate-spin" />
                        ) : (
                          <XOctagon size={11} />
                        )}
                        {t('v1.inferred.review.reject')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface EntityColumnProps {
  node: GraphNode;
  otherType: string;
  otherCount: number;
}

function EntityColumn({ node, otherType, otherCount }: EntityColumnProps) {
  const { t } = useTranslation('graph');
  const typeIsDifferent = node.type !== otherType;
  const countIsDifferent = node.chunkCount !== otherCount;

  return (
    <div className="p-3 space-y-3" style={{ borderColor: 'var(--border)' }}>
      <h4
        className="text-sm font-semibold"
        style={{ color: 'var(--fg-primary)' }}
      >
        {node.name}
      </h4>

      <Section title={t('v1.compare.basicInfo')}>
        <Row
          label={t('v1.compare.type')}
          value={t(`entityTypes.${node.type}`)}
          bold={typeIsDifferent}
        />
        <Row
          label={t('v1.compare.appearanceCount')}
          value={String(node.chunkCount)}
          bold={countIsDifferent}
        />
      </Section>

      {node.description && (
        <Section title={t('v1.compare.attributes')}>
          <p
            className="leading-relaxed"
            style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}
          >
            {node.description}
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-semibold uppercase"
      style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', letterSpacing: '0.06em' }}
    >
      {children}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: 'var(--fg-muted)' }}>{label}</span>
      <span
        style={{
          color: bold ? 'var(--fg-primary)' : 'var(--fg-muted)',
          fontWeight: bold ? 600 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}
