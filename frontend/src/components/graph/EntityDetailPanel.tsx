import { useMemo, useState } from 'react';
import { X, Loader, AlertTriangle, Bookmark, Users, RotateCcw } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchEntityAnalysis, triggerEntityAnalysis } from '@/api/analysis';
import { fetchEntityChunks } from '@/api/chunks';
import { fetchFactionAnalysis } from '@/api/factions';
import { deriveFactionLabel } from '@/services/kgClustering';
import { useTaskPolling } from '@/hooks/useTaskPolling';

import type { GraphNode, EntityType } from '@/api/types';

const PILL_KEY: Record<EntityType, string> = {
  character: 'char',
  location: 'loc',
  organization: 'org',
  object: 'obj',
  concept: 'con',
  other: 'other',
  event: 'evt',
};

interface EntityDetailPanelProps {
  readonly node: GraphNode;
  readonly bookId: string;
  /** Number of relations (graph degree) touching this entity in the current graph. */
  readonly relationCount: number;
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
    queryKey: ['books', bookId, 'entities', node.id, 'chunks'],
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
    queryKey: ['books', bookId, 'factions', 'panel'],
    queryFn: () => fetchFactionAnalysis(bookId, {}),
    enabled: node.type === 'character',
    staleTime: 5 * 60 * 1000,
  });
  const factionLabel = useMemo(() => {
    if (node.type !== 'character' || !factionData) return null;
    const f = factionData.factions.find((f) => (f.memberIds ?? []).includes(node.id));
    return f ? deriveFactionLabel(f.topMemberNames, f.label) : t('panel.unaffiliated');
  }, [factionData, node.type, node.id, t]);

  return (
    <div
      className="flex-shrink-0 h-full flex flex-col overflow-hidden"
      style={{
        width: 280,
        backgroundColor: 'var(--panel-bg)',
        borderLeft: '1px solid var(--panel-border)',
      }}
    >
      {/* Header — serif entity name + X close */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '12px 14px', borderBottom: '1px solid var(--panel-border)' }}
      >
        <h3
          className="truncate"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-size-lg, 18px)',
            fontWeight: 700,
            color: 'var(--panel-fg)',
            margin: 0,
          }}
        >
          {node.name}
        </h3>
        <button
          onClick={onClose}
          style={{ color: 'var(--panel-fg-muted)', background: 'none', border: 0, cursor: 'pointer' }}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto flex flex-col" style={{ padding: '14px', gap: 16 }}>
        {/* Meta row: type pill + (character) faction pill */}
        <div className="flex items-center flex-wrap" style={{ gap: 6 }}>
          <Pill type={node.type}>{t(`entityTypes.${node.type}`)}</Pill>
          {factionLabel && (
            <span
              className="inline-flex items-center"
              style={{
                gap: 4,
                padding: '1px 8px',
                borderRadius: 20,
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--font-size-xs, 12px)',
                backgroundColor: 'var(--panel-bg-card)',
                border: '0.5px solid var(--panel-border)',
                color: 'var(--panel-fg-muted)',
              }}
            >
              {t('panel.factionMeta', { label: factionLabel })}
            </span>
          )}
        </div>

        {/* Stat tiles */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <StatTile value={node.chunkCount} label={t('panel.statAppearances')} />
          <StatTile value={relationCount} label={t('panel.statRelations')} />
          <StatTile
            value={firstChapter != null && firstChapter !== Infinity ? firstChapter : '—'}
            label={t('panel.statFirstChapter')}
          />
        </div>

        {/* Actions: 加入比較 + 標記 (ghost) */}
        <div className="flex" style={{ gap: 8 }}>
          <GhostButton
            onClick={onAddToCompare}
            icon={<Users size={13} />}
            className="flex-1"
            active={isComparePending}
          >
            {isComparePending ? t('panel.comparePending') : t('panel.addToCompare')}
          </GhostButton>
          {onBookmarkToggle && (
            <GhostButton
              onClick={onBookmarkToggle}
              icon={<Bookmark size={13} fill={isBookmarked ? 'currentColor' : 'none'} />}
              active={isBookmarked}
              aria-pressed={isBookmarked}
            >
              {isBookmarked ? t('panel.bookmarked') : t('panel.bookmark')}
            </GhostButton>
          )}
        </div>

        {/* 深度分析 — character only */}
        {node.type === 'character' && (
          <AnalysisSection bookId={bookId} entityId={node.id} onShowAnalysis={onShowAnalysis} />
        )}

        {/* 相關段落 — chunk preview cards */}
        <section>
          <SectionHeading
            title={t('panel.relatedParagraphs')}
            extra={
              paragraphCount !== null ? (
                <span
                  style={{
                    fontSize: 'var(--font-size-2xs)',
                    color: 'var(--panel-fg-muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t('panel.paragraphsCount', { count: paragraphCount })}
                </span>
              ) : null
            }
          />
          <div className="flex flex-col" style={{ marginTop: 8, gap: 8 }}>
            {(chunksData?.chunks ?? []).slice(0, 3).map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '9px 10px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--panel-bg-card)',
                  border: '1px solid var(--panel-border)',
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--font-size-2xs)',
                    color: 'var(--panel-fg-muted)',
                    marginBottom: 3,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t('panel.chunkRef', { chapter: c.chapterNumber, order: c.order })}
                </div>
                <p
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'var(--font-size-sm, 14px)',
                    lineHeight: 1.6,
                    color: 'var(--panel-fg)',
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {c.content}
                </p>
              </div>
            ))}
            {paragraphCount !== null && (
              <LinkButton onClick={onShowParagraphs}>{t('entity.viewParagraphs')}</LinkButton>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Deep-analysis section (self-contained: owns its analysis query/trigger) ──

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

  const { data: analysis, isLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', entityId, 'analysis'],
    queryFn: () => fetchEntityAnalysis(bookId, entityId),
    retry: false,
  });

  const triggerMut = useMutation({
    mutationFn: () => triggerEntityAnalysis(bookId, entityId),
    onSuccess: (data) => {
      setTriggerError(null);
      setGenTaskId(data.taskId);
    },
    onError: () => setTriggerError(t('entity.triggerFailed')),
  });

  const { data: genTask } = useTaskPolling(genTaskId);

  function renderBody() {
    if (isLoading) return <InlineLoading text={t('entity.loading')} />;
    if (analysis) {
      return (
        <>
          <BodyText muted>
            {t('entity.generated', { date: new Date(analysis.generatedAt).toLocaleDateString() })}
          </BodyText>
          <LinkButton onClick={onShowAnalysis} style={{ marginTop: 6 }}>
            {t('entity.viewAnalysis')}
          </LinkButton>
        </>
      );
    }
    if (genTask?.status === 'error') {
      return (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 4 }}>
            <AlertTriangle size={12} style={{ color: 'var(--color-error)' }} />
            <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-error)' }}>
              {t('entity.analysisFailed')}
              {genTask.error ? `：${genTask.error}` : ''}
            </span>
          </div>
          <GhostButton
            accent
            onClick={() => {
              setGenTaskId(null);
              triggerMut.reset();
            }}
          >
            {t('entity.retry')}
          </GhostButton>
        </div>
      );
    }
    if (genTaskId && genTask && genTask.status !== 'done') {
      return <InlineLoading text={`${genTask.stage} (${genTask.progress}%)`} live />;
    }
    if (genTaskId && genTask?.status === 'done') {
      return <BodyText>{t('entity.analysisDone')}</BodyText>;
    }
    return (
      <div className="flex flex-col" style={{ gap: 8 }}>
        <BodyText muted>{t('entity.noAnalysis')}</BodyText>
        {triggerError && (
          <p style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-error)' }}>{triggerError}</p>
        )}
        <GhostButton accent onClick={() => triggerMut.mutate()} disabled={triggerMut.isPending}>
          {t('entity.generate')}
        </GhostButton>
      </div>
    );
  }

  return (
    <section>
      <SectionHeading
        title={t('panel.deepAnalysis')}
        extra={
          analysis ? (
            <LinkButton
              onClick={() => triggerMut.mutate()}
              disabled={triggerMut.isPending}
              icon={<RotateCcw size={11} />}
            >
              {t('panel.regenerate')}
            </LinkButton>
          ) : null
        }
      />
      <div style={{ marginTop: 8 }}>{renderBody()}</div>
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ value, label }: { readonly value: number | string; readonly label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        padding: '10px 4px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--panel-bg-card)',
        border: '1px solid var(--panel-border)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--font-size-xl, 22px)',
          fontWeight: 700,
          lineHeight: 1.1,
          color: 'var(--panel-fg)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--panel-fg-muted)', marginTop: 4 }}>
        {label}
      </span>
    </div>
  );
}

interface GhostButtonProps {
  readonly onClick: () => void;
  readonly children: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  /** Accent-tinted variant (border + text in accent) — for the generate/retry CTA. */
  readonly accent?: boolean;
  /** Filled/active state (bookmarked, compare pending). */
  readonly active?: boolean;
  readonly 'aria-pressed'?: boolean;
}

function GhostButton({
  onClick,
  children,
  icon,
  className,
  disabled,
  accent,
  active,
  ...rest
}: GhostButtonProps) {
  const fg = accent || active ? 'var(--accent)' : 'var(--panel-fg)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center ${className ?? ''}`}
      style={{
        gap: 5,
        padding: '7px 10px',
        borderRadius: 'var(--btn-radius)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--font-size-xs, 12px)',
        fontWeight: 500,
        color: fg,
        backgroundColor: active ? 'var(--panel-bg-card)' : 'transparent',
        border: `1px solid ${accent || active ? 'var(--accent)' : 'var(--panel-border)'}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background-color var(--transition-fast, 150ms) ease, border-color var(--transition-fast, 150ms) ease',
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

function SectionHeading({ title, extra }: { readonly title: string; readonly extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 6 }}>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--font-size-sm, 14px)',
          fontWeight: 600,
          color: 'var(--panel-fg)',
        }}
      >
        {title}
      </span>
      {extra}
    </div>
  );
}

function LinkButton({
  onClick,
  children,
  icon,
  disabled,
  style,
}: {
  readonly onClick: () => void;
  readonly children: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly disabled?: boolean;
  readonly style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center"
      style={{
        gap: 4,
        fontSize: 'var(--font-size-2xs)',
        color: 'var(--accent)',
        background: 'none',
        border: 0,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        padding: 0,
        textAlign: 'left',
        ...style,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function BodyText({ children, muted = false }: { readonly children: React.ReactNode; readonly muted?: boolean }) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--font-size-sm, 14px)',
        lineHeight: 1.65,
        color: muted ? 'var(--panel-fg-muted)' : 'var(--panel-fg)',
        margin: 0,
        textWrap: 'pretty',
      }}
    >
      {children}
    </p>
  );
}

function InlineLoading({ text, live = false }: { readonly text: string; readonly live?: boolean }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <Loader size={12} className="animate-spin" style={{ color: 'var(--panel-fg-muted)' }} />
      <span style={{ fontSize: 'var(--font-size-2xs)', color: live ? 'var(--panel-fg)' : 'var(--panel-fg-muted)' }}>
        {text}
      </span>
    </div>
  );
}

interface PillProps {
  readonly type: EntityType;
  readonly children: React.ReactNode;
}

function Pill({ type, children }: PillProps) {
  const key = PILL_KEY[type] ?? 'other';
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 4,
        padding: '1px 8px',
        borderRadius: 20,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--font-size-xs, 12px)',
        backgroundColor: `var(--entity-${key}-bg)`,
        borderColor: `var(--entity-${key}-border)`,
        color: `var(--entity-${key}-fg)`,
        border: `0.5px solid var(--entity-${key}-border)`,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: 'currentColor',
          opacity: 0.85,
        }}
      />
      {children}
    </span>
  );
}
