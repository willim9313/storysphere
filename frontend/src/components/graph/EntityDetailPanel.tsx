import { useState } from 'react';
import { X, ChevronDown, ChevronRight, Loader, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchEntityAnalysis, triggerEntityAnalysis } from '@/api/analysis';
import { useTaskPolling } from '@/hooks/useTaskPolling';

import type { GraphNode, EntityType } from '@/api/types';

const pillClass: Record<EntityType, string> = {
  character: 'pill-char',
  location: 'pill-loc',
  concept: 'pill-con',
  event: 'pill-evt',
};

interface EntityDetailPanelProps {
  node: GraphNode;
  bookId: string;
  onClose: () => void;
  onShowAnalysis: () => void;
  onShowParagraphs: () => void;
}

export function EntityDetailPanel({ node, bookId, onClose, onShowAnalysis, onShowParagraphs }: EntityDetailPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['info', 'analysis']));
  const [genTaskId, setGenTaskId] = useState<string | null>(null);

  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', node.id, 'analysis'],
    queryFn: () => fetchEntityAnalysis(bookId, node.id),
    retry: false,
  });

  const [triggerError, setTriggerError] = useState<string | null>(null);

  const triggerMut = useMutation({
    mutationFn: () => triggerEntityAnalysis(bookId, node.id),
    onSuccess: (data) => { setTriggerError(null); setGenTaskId(data.taskId); },
    onError: () => setTriggerError('觸發分析失敗，請稍後再試。'),
  });

  const { data: genTask } = useTaskPolling(genTaskId);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      className="flex-shrink-0 h-full overflow-y-auto"
      style={{
        width: 260,
        backgroundColor: 'var(--panel-bg)',
        borderLeft: '1px solid var(--panel-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3"
        style={{ borderBottom: '1px solid var(--panel-border)' }}
      >
        <h3
          className="text-sm font-semibold truncate"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--panel-fg)' }}
        >
          {node.name}
        </h3>
        <button onClick={onClose} style={{ color: 'var(--panel-fg-muted)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Sections */}
      <div className="p-2 space-y-1">
        {/* Entity Info */}
        <AccordionSection
          title="實體資訊"
          sectionKey="info"
          isOpen={openSections.has('info')}
          onToggle={toggleSection}
        >
          <span className={`pill ${pillClass[node.type]}`}>
            <span className="pill-dot" />
            {node.type}
          </span>
          {node.description && (
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--panel-fg)' }}>
              {node.description}
            </p>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--panel-fg-muted)' }}>
            出現於 {node.chunkCount} 個段落
          </p>
        </AccordionSection>

        {/* Deep Analysis */}
        <AccordionSection
          title="深度分析"
          sectionKey="analysis"
          isOpen={openSections.has('analysis')}
          onToggle={toggleSection}
        >
          {analysisLoading ? (
            <div className="flex items-center gap-2">
              <Loader size={12} className="animate-spin" style={{ color: 'var(--panel-fg-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--panel-fg-muted)' }}>載入中...</span>
            </div>
          ) : analysis ? (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--panel-fg-muted)' }}>
                已生成 · {new Date(analysis.generatedAt).toLocaleDateString('zh-TW')}
              </p>
              <button
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'var(--panel-bg-card)', color: 'var(--panel-fg)', border: '1px solid var(--panel-border)' }}
                onClick={onShowAnalysis}
              >
                查看深度分析 →
              </button>
            </div>
          ) : genTask?.status === 'error' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <AlertTriangle size={12} style={{ color: 'var(--danger, #e53e3e)' }} />
                <span className="text-xs" style={{ color: 'var(--danger, #e53e3e)' }}>
                  分析失敗{genTask.error ? `：${genTask.error}` : ''}
                </span>
              </div>
              <button
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                onClick={() => { setGenTaskId(null); triggerMut.reset(); }}
              >
                重試 →
              </button>
            </div>
          ) : genTaskId && genTask && genTask.status !== 'done' ? (
            <div className="flex items-center gap-2">
              <Loader size={12} className="animate-spin" style={{ color: 'var(--panel-fg-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--panel-fg)' }}>
                {genTask.stage} ({genTask.progress}%)
              </span>
            </div>
          ) : genTaskId && genTask?.status === 'done' ? (
            <p className="text-xs" style={{ color: 'var(--panel-fg)' }}>
              深度分析已完成。重新載入後即可查看。
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--panel-fg-muted)' }}>
                尚未生成深度分析。此操作將消耗 token。
              </p>
              {triggerError && (
                <p className="text-xs" style={{ color: 'var(--danger, #e53e3e)' }}>{triggerError}</p>
              )}
              <button
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                onClick={() => triggerMut.mutate()}
                disabled={triggerMut.isPending}
              >
                生成深度分析 →
              </button>
            </div>
          )}
        </AccordionSection>

        {/* Related Paragraphs */}
        <AccordionSection
          title="相關段落"
          sectionKey="paragraphs"
          isOpen={openSections.has('paragraphs')}
          onToggle={toggleSection}
        >
          <p className="text-xs mb-2" style={{ color: 'var(--panel-fg-muted)' }}>
            共 {node.chunkCount} 個段落
          </p>
          <button
            className="text-xs px-2 py-1 rounded"
            style={{ backgroundColor: 'var(--panel-bg-card)', color: 'var(--panel-fg)', border: '1px solid var(--panel-border)' }}
            onClick={onShowParagraphs}
          >
            查看相關段落 →
          </button>
        </AccordionSection>
      </div>
    </div>
  );
}

function AccordionSection({
  title,
  sectionKey,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  sectionKey: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ backgroundColor: 'var(--panel-bg-card)' }}
    >
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
        onClick={() => onToggle(sectionKey)}
      >
        {isOpen ? (
          <ChevronDown size={12} style={{ color: 'var(--panel-fg-muted)' }} />
        ) : (
          <ChevronRight size={12} style={{ color: 'var(--panel-fg-muted)' }} />
        )}
        <span className="text-xs font-medium" style={{ color: 'var(--panel-fg)' }}>
          {title}
        </span>
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
