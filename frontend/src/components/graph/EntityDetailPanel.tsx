import { useState } from 'react';
import { X, ChevronDown, ChevronRight, Loader, AlertTriangle, Pin } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchEntityAnalysis, triggerEntityAnalysis } from '@/api/analysis';
import { fetchEntityChunks } from '@/api/chunks';
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
  readonly onClose: () => void;
  readonly onShowAnalysis: () => void;
  readonly onShowParagraphs: () => void;
  readonly isBookmarked?: boolean;
  readonly onBookmarkToggle?: () => void;
}

export function EntityDetailPanel({
  node,
  bookId,
  onClose,
  onShowAnalysis,
  onShowParagraphs,
  isBookmarked,
  onBookmarkToggle,
}: EntityDetailPanelProps) {
  const { t } = useTranslation('graph');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['info', 'analysis']));
  const [genTaskId, setGenTaskId] = useState<string | null>(null);

  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['books', bookId, 'entities', node.id, 'analysis'],
    queryFn: () => fetchEntityAnalysis(bookId, node.id),
    retry: false,
  });

  const { data: chunksData } = useQuery({
    queryKey: ['books', bookId, 'entities', node.id, 'chunks'],
    queryFn: () => fetchEntityChunks(bookId, node.id),
  });
  const paragraphCount = chunksData?.total ?? null;

  const [triggerError, setTriggerError] = useState<string | null>(null);

  const triggerMut = useMutation({
    mutationFn: () => triggerEntityAnalysis(bookId, node.id),
    onSuccess: (data) => {
      setTriggerError(null);
      setGenTaskId(data.taskId);
    },
    onError: () => setTriggerError(t('entity.triggerFailed')),
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
      className="flex-shrink-0 h-full flex flex-col overflow-hidden"
      style={{
        width: 260,
        backgroundColor: 'var(--panel-bg)',
        borderLeft: '1px solid var(--panel-border)',
      }}
    >
      {/* Header — serif h3 entity name + X close */}
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
      <div
        className="flex-1 overflow-y-auto flex flex-col"
        style={{ padding: '12px 14px', gap: 14 }}
      >
        {/* Meta row: pill + appearances + bookmark toggle */}
        <div className="flex items-center flex-wrap" style={{ gap: 6 }}>
          <Pill type={node.type}>{t(`entityTypes.${node.type}`)}</Pill>
          <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--panel-fg-muted)' }}>
            {t('panel.appearancesMeta', { count: node.chunkCount })}
          </span>
          {onBookmarkToggle && (
            <button
              onClick={onBookmarkToggle}
              className="inline-flex items-center"
              style={{
                marginLeft: 'auto',
                gap: 3,
                background: 'none',
                border: 0,
                cursor: 'pointer',
                fontSize: 'var(--font-size-2xs)',
                color: isBookmarked ? 'var(--accent)' : 'var(--panel-fg-muted)',
                fontFamily: 'inherit',
              }}
              aria-pressed={isBookmarked}
            >
              <Pin size={11} fill={isBookmarked ? 'currentColor' : 'none'} />
              {isBookmarked ? t('panel.bookmarked') : t('panel.bookmark')}
            </button>
          )}
        </div>

        {/* 實體資訊 */}
        <Section
          title={t('panel.entityInfo')}
          isOpen={openSections.has('info')}
          onToggle={() => toggleSection('info')}
        >
          {node.description ? (
            <SectionBody>
              <p>{node.description}</p>
            </SectionBody>
          ) : (
            <SectionBody muted>
              <p>{t('entity.noAnalysis')}</p>
            </SectionBody>
          )}
        </Section>

        {/* 深度分析 — 僅 character 有後端支援 */}
        {node.type === 'character' && <Section
          title={t('panel.deepAnalysis')}
          isOpen={openSections.has('analysis')}
          onToggle={() => toggleSection('analysis')}
          headerExtra={
            analysis ? (
              <button
                onClick={() => triggerMut.mutate()}
                disabled={triggerMut.isPending}
                style={{
                  marginLeft: 'auto',
                  fontSize: 'var(--font-size-2xs)',
                  color: 'var(--accent)',
                  background: 'none',
                  border: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                  fontFamily: 'inherit',
                }}
              >
                {t('panel.regenerate')}
              </button>
            ) : null
          }
        >
          {analysisLoading ? (
            <div className="flex items-center gap-2">
              <Loader
                size={12}
                className="animate-spin"
                style={{ color: 'var(--panel-fg-muted)' }}
              />
              <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--panel-fg-muted)' }}>
                {t('entity.loading')}
              </span>
            </div>
          ) : analysis ? (
            <>
              <SectionBody>
                <p style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--panel-fg-muted)', marginBottom: 6 }}>
                  {t('entity.generated', {
                    date: new Date(analysis.generatedAt).toLocaleDateString(),
                  })}
                </p>
              </SectionBody>
              <button
                onClick={onShowAnalysis}
                style={{
                  marginTop: 6,
                  fontSize: 'var(--font-size-2xs)',
                  color: 'var(--accent)',
                  background: 'none',
                  border: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  padding: 0,
                }}
              >
                {t('entity.viewAnalysis')}
              </button>
            </>
          ) : genTask?.status === 'error' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <AlertTriangle size={12} style={{ color: 'var(--color-error)' }} />
                <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-error)' }}>
                  {t('entity.analysisFailed')}
                  {genTask.error ? `：${genTask.error}` : ''}
                </span>
              </div>
              <button
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
                onClick={() => {
                  setGenTaskId(null);
                  triggerMut.reset();
                }}
              >
                {t('entity.retry')}
              </button>
            </div>
          ) : genTaskId && genTask && genTask.status !== 'done' ? (
            <div className="flex items-center gap-2">
              <Loader
                size={12}
                className="animate-spin"
                style={{ color: 'var(--panel-fg-muted)' }}
              />
              <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--panel-fg)' }}>
                {genTask.stage} ({genTask.progress}%)
              </span>
            </div>
          ) : genTaskId && genTask?.status === 'done' ? (
            <SectionBody>
              <p>{t('entity.analysisDone')}</p>
            </SectionBody>
          ) : (
            <div className="flex flex-col" style={{ gap: 6 }}>
              <SectionBody muted>
                <p>{t('entity.noAnalysis')}</p>
              </SectionBody>
              {triggerError && (
                <p style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-error)' }}>{triggerError}</p>
              )}
              <button
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
                onClick={() => triggerMut.mutate()}
                disabled={triggerMut.isPending}
              >
                {t('entity.generate')}
              </button>
            </div>
          )}
        </Section>}

        {/* 相關段落 (collapsed by default, right-aligned count) */}
        <Section
          title={t('panel.relatedParagraphs')}
          isOpen={openSections.has('paragraphs')}
          onToggle={() => toggleSection('paragraphs')}
          headerExtra={
            paragraphCount !== null ? (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 'var(--font-size-2xs)',
                  color: 'var(--panel-fg-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t('panel.paragraphsCount', { count: paragraphCount })}
              </span>
            ) : null
          }
        >
          <SectionBody>
            <p>{paragraphCount !== null ? t('entity.paragraphCount', { count: paragraphCount }) : ''}</p>
          </SectionBody>
          <button
            onClick={onShowParagraphs}
            style={{
              marginTop: 6,
              fontSize: 'var(--font-size-2xs)',
              color: 'var(--accent)',
              background: 'none',
              border: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              fontFamily: 'inherit',
              textAlign: 'left',
              padding: 0,
            }}
          >
            {t('entity.viewParagraphs')}
          </button>
        </Section>
      </div>
    </div>
  );
}

interface SectionProps {
  readonly title: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly headerExtra?: React.ReactNode;
  readonly children?: React.ReactNode;
}

function Section({ title, isOpen, onToggle, headerExtra, children }: SectionProps) {
  return (
    <div>
      <div className="flex items-center w-full" style={{ gap: 6 }}>
        <button
          onClick={onToggle}
          className="flex items-center flex-1 text-left"
          style={{
            gap: 6,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--font-size-xs, 12px)',
            fontWeight: 600,
            color: 'var(--fg-secondary, var(--panel-fg))',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: 'none',
            border: 0,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {isOpen ? (
            <ChevronDown
              size={11}
              strokeWidth={1.8}
              style={{ color: 'var(--panel-fg-muted)' }}
            />
          ) : (
            <ChevronRight
              size={11}
              strokeWidth={1.8}
              style={{ color: 'var(--panel-fg-muted)' }}
            />
          )}
          <span>{title}</span>
        </button>
        {headerExtra}
      </div>
      {isOpen && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

function SectionBody({
  children,
  muted = false,
}: {
  readonly children: React.ReactNode;
  readonly muted?: boolean;
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--font-size-sm, 14px)',
        lineHeight: 1.65,
        color: muted ? 'var(--panel-fg-muted)' : 'var(--panel-fg)',
        textWrap: 'pretty',
      }}
    >
      {children}
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
