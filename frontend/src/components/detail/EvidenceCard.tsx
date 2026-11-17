import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { ApiError, apiFetch } from '@/api/client';
import { useReviewEvidence, useTrace, type EvidenceItem } from '@/api/evidence';
import { claimTypeLabel } from '@/components/views/labels';

const REVIEW: Record<string, { label: string; cls: string }> = {
  pending: { label: '待審', cls: 'ss-badge-info' },
  approved: { label: '已確認', cls: 'ss-badge-success' },
  modified: { label: '已修改', cls: 'ss-badge-success' },
  rejected: { label: '已拒絕', cls: 'ss-badge-error' },
};

// 上游很多時（CH5 一筆引用上百個事件）先只列這幾筆。
const TRACE_PREVIEW = 12;

const small: CSSProperties = { fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' };

export interface SourceRef {
  paragraphId: string;
  evidenceId: string;
}

/** 追溯到原文：N-05c 的上游節點，第 1 層的引文可以開原文側板。 */
function TraceList({
  bookId,
  evidenceId,
  onOpenSource,
}: Readonly<{ bookId: string; evidenceId: string; onOpenSource: (ref: SourceRef) => void }>) {
  const { data, isLoading, error } = useTrace(bookId, evidenceId);
  const [showAll, setShowAll] = useState(false);
  if (isLoading) return <span style={small}>讀取中…</span>;
  if (error) return <span style={{ ...small, color: 'var(--color-error)' }}>讀不到追溯：{error instanceof ApiError ? error.detail : String(error)}</span>;
  const all = (data?.nodes ?? []).filter((node) => node.id !== evidenceId);
  if (all.length === 0) return <span style={small}>沒有上游。</span>;
  const nodes = showAll ? all : all.slice(0, TRACE_PREVIEW);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingLeft: 'var(--space-4)', borderLeft: 'var(--border-width) var(--border-style) var(--border)' }}>
      {nodes.map((node) =>
        node.kind === 'run' ? (
          <span key={node.id} style={small}>
            run · {node.code ?? node.refId}
          </span>
        ) : (
          <div key={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', ...small }}>
              <span>{claimTypeLabel(node.claimType ?? '')}</span>
              <span>
                L{node.level}
                {node.discourseChapter ? ` · 第 ${node.discourseChapter} 章` : ''}
              </span>
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
              {node.firstQuote ? `「${node.firstQuote}」` : node.summary}
            </span>
            <SourceLink bookId={bookId} evidenceId={node.id} onOpenSource={onOpenSource} />
          </div>
        ),
      )}
      {!showAll && all.length > TRACE_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{ all: 'unset', cursor: 'pointer', ...small, color: 'var(--accent)' }}
        >
          再顯示 {all.length - TRACE_PREVIEW} 筆上游
        </button>
      )}
    </div>
  );
}

/** 「看原文」：要先知道引文在哪一段，所以按下去才查 N-05b。 */
function SourceLink({
  bookId,
  evidenceId,
  onOpenSource,
}: Readonly<{ bookId: string; evidenceId: string; onOpenSource: (ref: SourceRef) => void }>) {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    setLoading(true);
    try {
      const detail = await apiFetch<{ quotes: { paragraphId: string }[]; discourseParagraphId: string | null }>(
        `/books/${encodeURIComponent(bookId)}/evidence/${encodeURIComponent(evidenceId)}`,
      );
      const paragraphId = detail.quotes[0]?.paragraphId ?? detail.discourseParagraphId;
      if (paragraphId) onOpenSource({ paragraphId, evidenceId });
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={loading}
      style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--font-size-2xs)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}
    >
      看原文
      <ExternalLink size={11} aria-hidden="true" />
    </button>
  );
}

/** 結果卡詳情右欄的一筆證據：摘要、審核（確認／拒絕）、追溯到原文（05 §3.2）。 */
export function EvidenceCard({
  bookId,
  item,
  selected,
  onOpenSource,
}: Readonly<{ bookId: string; item: EvidenceItem; selected?: boolean; onOpenSource: (ref: SourceRef) => void }>) {
  const [traceOpen, setTraceOpen] = useState(false);
  const review = useReviewEvidence(bookId);
  const ref = useRef<HTMLElement>(null);
  // 在 view 裡點到這筆時，捲到看得見（列表可能有幾百筆）。
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);
  const status = item.status === 'rejected' ? REVIEW.rejected : REVIEW[item.reviewStatus] ?? REVIEW.pending;
  // 第 1 層不能審核（04 §1.2 `level1_readonly`）；已拒絕的不能再審。
  const reviewable = item.level >= 2 && item.status !== 'rejected';
  return (
    <article
      ref={ref}
      style={{
        border: `var(--border-width) var(--border-style) ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' }}>
          {claimTypeLabel(item.claimType)}
        </span>
        <span className="ss-badge ss-badge-neutral">L{item.level}</span>
        <span className={`ss-badge ${status.cls}`}>{status.label}</span>
        {item.basisChanged && <span className="ss-badge ss-badge-warning">依據已變動</span>}
        <span style={{ ...small, marginLeft: 'auto' }}>
          信心 {item.confidence.toFixed(2)}
          {item.discourseChapter ? ` · 第 ${item.discourseChapter} 章` : ''}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>{item.summary}</p>
      {item.firstQuote && (
        <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
          「{item.firstQuote}」
        </p>
      )}
      {item.quoteCount > 0 && <SourceLink bookId={bookId} evidenceId={item.id} onOpenSource={onOpenSource} />}
      {reviewable && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {item.reviewStatus === 'pending' && (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary"
              disabled={review.isPending}
              onClick={() => review.mutate({ evidenceId: item.id, action: 'approve' })}
            >
              確認
            </button>
          )}
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-danger"
            disabled={review.isPending}
            onClick={() => {
              const reason = window.prompt('拒絕的理由（可留空）。拒絕後，引用它的下游證據與筆記會標「依據已變動」。');
              if (reason !== null) review.mutate({ evidenceId: item.id, action: 'reject', reason: reason || undefined });
            }}
          >
            拒絕
          </button>
        </div>
      )}
      {review.error && (
        <span role="alert" style={{ ...small, color: 'var(--color-error)' }}>
          {review.error instanceof ApiError ? review.error.detail : String(review.error)}
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <button
          type="button"
          aria-expanded={traceOpen}
          onClick={() => setTraceOpen((open) => !open)}
          style={{ all: 'unset', cursor: 'pointer', ...small, color: 'var(--fg-secondary)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}
        >
          {traceOpen ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
          追溯到原文
        </button>
        {traceOpen && <TraceList bookId={bookId} evidenceId={item.id} onOpenSource={onOpenSource} />}
      </div>
    </article>
  );
}
