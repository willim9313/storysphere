import { useMemo, useState } from 'react';
import { X, Loader, AlertTriangle, Bookmark, Users } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchEntityAnalysis, triggerEntityAnalysis } from '@/api/analysis';
import { fetchEntityChunks } from '@/api/chunks';
import { fetchFactionAnalysis } from '@/api/factions';
import { isLlmUnconfigured } from '@/api/failureKind';
import { LlmUnconfiguredNotice } from '@/components/ui/LlmUnconfiguredNotice';
import { deriveFactionLabel } from '@/services/kgClustering';
import { useTaskPolling } from '@/hooks/useTaskPolling';

import type { GraphNode } from '@/api/types';
import { qk } from '@/api/queryKeys';
import type { EntityRelationRow } from './entityRelations';

/** Relations shown before 「顯示全部」. */
const RELATIONS_PREVIEW = 8;

interface EntityDetailPanelProps {
  readonly node: GraphNode;
  readonly bookId: string;
  /** Number of relations (graph degree) touching this entity in the current graph. */
  readonly relationCount: number;
  /** Confirmed (non-inferred) relations of this entity, already sorted. */
  readonly relations: readonly EntityRelationRow[];
  /** Select the other entity — same behaviour as tapping its node on the canvas. */
  readonly onSelectRelated: (entityId: string) => void;
  readonly onClose: () => void;
  readonly onShowAnalysis: () => void;
  readonly onShowParagraphs: () => void;
  readonly onAddToCompare: () => void;
  /** True while this entity is the first pick of a pending comparison. */
  readonly isComparePending?: boolean;
  readonly isBookmarked?: boolean;
  readonly onBookmarkToggle?: () => void;
}

export function EntityDetailPanel({
  node,
  bookId,
  relationCount,
  relations,
  onSelectRelated,
  onClose,
  onShowAnalysis,
  onShowParagraphs,
  onAddToCompare,
  isComparePending,
  isBookmarked,
  onBookmarkToggle,
}: EntityDetailPanelProps) {
  const { t } = useTranslation('graph');

  const { data: chunksData } = useQuery({
    queryKey: qk.entity.chunks(bookId, node.id),
    queryFn: () => fetchEntityChunks(bookId, node.id),
  });
  const paragraphCount = chunksData?.total ?? null;

  // First-appearance chapter — min chapterNumber across the entity's chunks.
  const firstChapter = useMemo(() => {
    const chunks = chunksData?.chunks ?? [];
    if (chunks.length === 0) return null;
    return chunks.reduce((min, c) => Math.min(min, c.chapterNumber), Infinity);
  }, [chunksData]);

  // Faction affiliation pill — characters only (faction detection clusters
  // characters; non-character entities are never affiliated). Cached once.
  const { data: factionData } = useQuery({
    queryKey: qk.factionsPanel(bookId),
    queryFn: () => fetchFactionAnalysis(bookId, {}),
    enabled: node.type === 'character',
    staleTime: 5 * 60 * 1000,
  });
  const factionLabel = useMemo(() => {
    if (node.type !== 'character' || !factionData) return null;
    const f = (factionData.factions ?? []).find((f) => (f.memberIds ?? []).includes(node.id));
    return f ? deriveFactionLabel(f.topMemberNames, f.label) : t('panel.unaffiliated');
  }, [factionData, node.type, node.id, t]);

  return (
    <div className="kg-panel">
      <div className="kg-panel-head">
        <h3 className="kg-panel-title">{node.name}</h3>
        <button type="button" onClick={onClose} className="kg-icon-btn" aria-label={t('a11y.close')}>
          <X size={14} />
        </button>
      </div>

      <div className="kg-panel-body">
        {/* Meta row: type pill + (character) faction pill */}
        <div className="kg-chiprow">
          <span className={`ss-pill ss-pill-${node.type}`} style={{ margin: 0 }}>
            <span className="ss-pill-dot" />
            {t(`entityTypes.${node.type}`)}
          </span>
          {factionLabel && <span className="kg-tag">{t('panel.factionMeta', { label: factionLabel })}</span>}
        </div>

        {/* Stat tiles */}
        <div className="kg-stats3">
          <StatTile value={node.chunkCount} label={t('panel.statAppearances')} />
          <StatTile value={relationCount} label={t('panel.statRelations')} />
          <StatTile
            value={firstChapter != null && firstChapter !== Infinity ? firstChapter : '—'}
            label={t('panel.statFirstChapter')}
          />
        </div>

        {/* Actions: 加入比較 + 標記 — zero cost, no glyph */}
        <div className="kg-actions">
          <button
            type="button"
            onClick={onAddToCompare}
            className={`ss-btn ss-btn-sm ss-btn-secondary${isComparePending ? ' is-pending' : ''}`}
            style={isComparePending ? { color: 'var(--accent)', fontWeight: 700 } : undefined}
          >
            <Users size={12} />
            {isComparePending ? t('panel.comparePending') : t('panel.addToCompare')}
          </button>
          {onBookmarkToggle && (
            <button
              type="button"
              onClick={onBookmarkToggle}
              aria-pressed={isBookmarked}
              className="ss-btn ss-btn-sm ss-btn-secondary"
              style={isBookmarked ? { color: 'var(--accent)', fontWeight: 700 } : undefined}
            >
              <Bookmark size={12} fill={isBookmarked ? 'currentColor' : 'none'} />
              {isBookmarked ? t('panel.bookmarked') : t('panel.bookmark')}
            </button>
          )}
        </div>

        <RelationsSection relations={relations} onSelectRelated={onSelectRelated} />

        {/* 深度分析 — character only */}
        {node.type === 'character' && (
          <AnalysisSection bookId={bookId} entityId={node.id} onShowAnalysis={onShowAnalysis} />
        )}

        {/* 相關段落 — chunk preview */}
        <section className="kg-section">
          <div className="kg-section-head">
            <span className="kg-label">{t('panel.relatedParagraphs')}</span>
            {paragraphCount !== null && (
              <span className="kg-note">{t('panel.paragraphsCount', { count: paragraphCount })}</span>
            )}
          </div>
          {(chunksData?.chunks ?? []).slice(0, 3).map((c) => (
            <div key={c.id} className="kg-chunk">
              <span className="kg-chunk-ref">{t('panel.chunkRef', { chapter: c.chapterNumber, order: c.order })}</span>
              <p className="kg-chunk-text">{c.content}</p>
            </div>
          ))}
          {paragraphCount !== null && (
            <button
              type="button"
              onClick={onShowParagraphs}
              className="ss-btn ss-btn-sm ss-btn-ghost"
              style={{ alignSelf: 'flex-start' }}
            >
              {t('entity.viewParagraphs')}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Relations list ───────────────────────────────────────────────────────────
// Keyboard/screen-reader route into the graph: the canvas is a bitmap, so the
// neighbourhood is listed here. Cooperative/hostile is carried by a line glyph
// (solid / dashed, mirroring the canvas edge) plus hidden text, never colour alone.

function RelationsSection({
  relations,
  onSelectRelated,
}: {
  readonly relations: readonly EntityRelationRow[];
  readonly onSelectRelated: (entityId: string) => void;
}) {
  const { t } = useTranslation('graph');
  const [expanded, setExpanded] = useState(false);
  const overflow = relations.length > RELATIONS_PREVIEW;
  const shown = expanded ? relations : relations.slice(0, RELATIONS_PREVIEW);

  return (
    <section className="kg-section" aria-label={t('relations.title')}>
      <div className="kg-section-head">
        <span className="kg-label">{t('relations.title')}</span>
        <span className="kg-note">{t('relations.count', { count: relations.length })}</span>
      </div>
      {relations.length === 0 ? (
        <p className="kg-note">{t('relations.empty')}</p>
      ) : (
        <ul className="kg-rel-list">
          {shown.map((r) => (
            <li key={r.edgeId}>
              <button type="button" className="kg-rel-row" onClick={() => onSelectRelated(r.otherId)}>
                <RelationGlyph bucket={r.bucket} />
                <span className="kg-rel-name">{r.otherName}</span>
                <span className="kg-rel-type">
                  {t(`relations.types.${r.type || 'unknown'}`, { defaultValue: r.type })}
                </span>
                {r.bucket !== 'neutral' && (
                  <span className="kg-vh">
                    {r.bucket === 'positive' ? t('relations.cooperative') : t('relations.hostile')}
                  </span>
                )}
                {r.hidden && <span className="kg-rel-off">{t('relations.offCanvas')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ss-btn ss-btn-sm ss-btn-ghost"
          style={{ alignSelf: 'flex-start' }}
        >
          {expanded ? t('relations.showLess') : t('relations.showAll', { count: relations.length })}
        </button>
      )}
    </section>
  );
}

/** Short line segment mirroring the canvas edge: cooperative solid, hostile dashed, neutral none. */
function RelationGlyph({ bucket }: { readonly bucket: EntityRelationRow['bucket'] }) {
  return (
    <svg className="kg-rel-glyph" width="18" height="6" viewBox="0 0 18 6" aria-hidden="true" focusable="false">
      {bucket !== 'neutral' && (
        <line
          x1="1"
          y1="3"
          x2="17"
          y2="3"
          stroke="currentColor"
          strokeWidth={bucket === 'positive' ? 2 : 1.5}
          strokeDasharray={bucket === 'negative' ? '4 3' : undefined}
          strokeLinecap="butt"
        />
      )}
    </svg>
  );
}

// ── Deep-analysis section (self-contained: owns its analysis query/trigger) ──
// The only spend-token entrance on this panel: 生成深度分析 → and 覆蓋重生成 both
// carry the cost glyph. The app's own 503 (no LLM provider) is a feature state,
// shown in place; the rest of the panel stays.

function AnalysisSection({
  bookId,
  entityId,
  onShowAnalysis,
}: {
  readonly bookId: string;
  readonly entityId: string;
  readonly onShowAnalysis: () => void;
}) {
  const { t } = useTranslation('graph');
  const [genTaskId, setGenTaskId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);

  const { data: analysis, isLoading } = useQuery({
    queryKey: qk.entity.analysis(bookId, entityId),
    queryFn: () => fetchEntityAnalysis(bookId, entityId),
    retry: false,
  });

  const triggerMut = useMutation({
    mutationFn: () => triggerEntityAnalysis(bookId, entityId),
    onSuccess: (data) => {
      setTriggerError(null);
      setUnconfigured(false);
      setGenTaskId(data.taskId);
    },
    onError: (err) => {
      if (isLlmUnconfigured(err)) {
        setUnconfigured(true);
        setTriggerError(null);
      } else {
        setUnconfigured(false);
        setTriggerError(t('entity.triggerFailed'));
      }
    },
  });

  const { data: genTask } = useTaskPolling(genTaskId);

  function renderBody() {
    if (isLoading) return <InlineLoading text={t('entity.loading')} />;
    if (analysis) {
      return (
        <>
          <p className="kg-note">
            {t('entity.generated', { date: new Date(analysis.generatedAt).toLocaleDateString() })}
          </p>
          <button
            type="button"
            onClick={onShowAnalysis}
            className="ss-btn ss-btn-sm ss-btn-ghost"
            style={{ alignSelf: 'flex-start' }}
          >
            {t('entity.viewAnalysis')}
          </button>
          {unconfigured && <LlmUnconfiguredNotice />}
          {triggerError && <p className="kg-inline-error">{triggerError}</p>}
        </>
      );
    }
    if (genTask?.status === 'error') {
      return (
        <>
          <div className="kg-inline-error">
            <AlertTriangle size={12} />
            <span>
              {t('entity.analysisFailed')}
              {genTask.error ? `：${genTask.error}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              setGenTaskId(null);
              triggerMut.reset();
            }}
          >
            {t('entity.retry')}
          </button>
        </>
      );
    }
    if (genTaskId && genTask && genTask.status !== 'done') {
      return <InlineLoading text={`${genTask.stage} (${genTask.progress}%)`} />;
    }
    if (genTaskId && genTask?.status === 'done') {
      return <p className="kg-text">{t('entity.analysisDone')}</p>;
    }
    return (
      <>
        <p className="kg-note">{t('entity.noAnalysis')}</p>
        {triggerError && <p className="kg-inline-error">{triggerError}</p>}
        {unconfigured ? (
          <LlmUnconfiguredNotice />
        ) : (
          <button
            type="button"
            onClick={() => triggerMut.mutate()}
            disabled={triggerMut.isPending}
            className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
            style={{ alignSelf: 'flex-start' }}
          >
            {t('entity.generate')}
          </button>
        )}
      </>
    );
  }

  return (
    <section className="kg-section">
      <div className="kg-section-head">
        <span className="kg-label">{t('panel.deepAnalysis')}</span>
        {analysis && (
          <button
            type="button"
            onClick={() => triggerMut.mutate()}
            disabled={triggerMut.isPending}
            className="ss-btn ss-btn-sm ss-btn-ghost ss-btn-llm"
          >
            {t('panel.regenerate')}
          </button>
        )}
      </div>
      {renderBody()}
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ value, label }: { readonly value: number | string; readonly label: string }) {
  return (
    <div className="kg-stat3">
      <span className="kg-stat3-value">{value}</span>
      <span className="kg-stat3-label">{label}</span>
    </div>
  );
}

function InlineLoading({ text }: { readonly text: string }) {
  return (
    <div className="kg-inline-load">
      <Loader size={12} className="animate-spin" />
      <span>{text}</span>
    </div>
  );
}
