import { useMemo, useState } from 'react';
import { X, ChevronRight, ArrowUpDown, RotateCw, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FactionAnalysisResponse } from '@/api/factions';
import type { EntityType, GraphNode } from '@/api/types';
import type { ClusteredGraph } from '@/services/kgClustering';

interface ClusterOverviewPanelProps {
  clustered: ClusteredGraph | null;
  graphNodes: GraphNode[];
  drillInType: string | null;
  onClose: () => void;
  onDrillIn: (clusterType: string) => void;
  onExitDrillIn: () => void;
  onMemberSelect?: (id: string) => void;
  // Community mode only
  factionAnalysis?: FactionAnalysisResponse | null;
  factionSettings?: FactionSettings;
  onFactionSettingsChange?: (next: FactionSettings) => void;
  onFactionRecompute?: () => void;
  isRecomputing?: boolean;
}

export interface FactionSettings {
  resolution: number;       // 0.1 – 4.0
  minClusterSize: number;   // ≥ 2
}

type SortKey = 'importance' | 'name';

const ENTITY_LABEL: Record<EntityType, string> = {
  character: '角',
  location: '地',
  concept: '概',
  event: '事',
  organization: '組',
  object: '物',
  other: '他',
};

function dotKey(type: EntityType | string): string {
  switch (type) {
    case 'concept':
      return 'con';
    case 'event':
      return 'evt';
    case 'location':
      return 'loc';
    case 'character':
      return 'char';
    case 'organization':
      return 'org';
    case 'object':
      return 'obj';
    default:
      return 'other';
  }
}

/** Composition counts by entity type, in fixed order for stable display. */
function compositionOf(
  memberIds: string[],
  nodeMap: Map<string, GraphNode>,
): Array<[EntityType, number]> {
  const counts = new Map<EntityType, number>();
  for (const id of memberIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  const order: EntityType[] = [
    'character',
    'location',
    'concept',
    'event',
    'organization',
    'object',
    'other',
  ];
  return order
    .filter((t) => counts.has(t))
    .map((t) => [t, counts.get(t)!] as [EntityType, number]);
}

export function ClusterOverviewPanel({
  clustered,
  graphNodes,
  drillInType,
  onClose,
  onDrillIn,
  onExitDrillIn,
  onMemberSelect,
  factionAnalysis,
  factionSettings,
  onFactionSettingsChange,
  onFactionRecompute,
  isRecomputing,
}: ClusterOverviewPanelProps) {
  const { t } = useTranslation('graph');
  const [sortKey, setSortKey] = useState<SortKey>('importance');

  const nodeMap = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);
  const isCommunityMode = !!factionAnalysis;

  // ── Drill-in view ────────────────────────────────────────────────────────
  if (drillInType) {
    return (
      <DrillInPanel
        clustered={clustered}
        drillInType={drillInType}
        nodeMap={nodeMap}
        sortKey={sortKey}
        setSortKey={setSortKey}
        onClose={onClose}
        onExitDrillIn={onExitDrillIn}
        onMemberSelect={onMemberSelect}
        factionAnalysis={factionAnalysis}
      />
    );
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  const overviewClusters = clustered?.superNodes ?? [];

  return (
    <PanelShell title={t('v1.cluster.overview')} onClose={onClose}>
      {/* Cluster cards */}
      <ul className="space-y-2">
        {overviewClusters.map((c) => {
          const matchedFaction = factionAnalysis?.factions?.find(
            (f) => `cluster:${f.id}` === c.id,
          );
          const composition = isCommunityMode
            ? compositionOf(c.memberIds, nodeMap)
            : null;
          const title = c.label ?? t(`entityTypes.${c.clusterType}`);

          return (
            <li key={c.id}>
              <button
                onClick={() => onDrillIn(c.clusterType)}
                className="w-full text-left rounded-md p-2.5"
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  transition: 'background-color var(--transition-fast, 150ms) ease',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')
                }
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {composition ? (
                      <CompositionStack composition={composition} />
                    ) : (
                      <span
                        className="inline-block rounded-full"
                        style={{
                          width: 10,
                          height: 10,
                          flexShrink: 0,
                          backgroundColor: `var(--entity-${dotKey(c.clusterType)}-dot)`,
                        }}
                      />
                    )}
                    <span
                      className="text-xs font-semibold truncate"
                      style={{
                        color: 'var(--fg-primary)',
                        fontFamily: 'var(--font-serif)',
                      }}
                    >
                      {title}
                    </span>
                  </div>
                  <ChevronRight size={12} style={{ color: 'var(--fg-muted)' }} />
                </div>
                <div
                  className="text-[10px] tabular-nums"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  {composition
                    ? `${c.count} 個 · ${composition
                        .map(([type, n]) => `${ENTITY_LABEL[type]}${n}`)
                        .join(' / ')}`
                    : `${c.count} 個成員`}
                  {matchedFaction && (
                    <span style={{ marginLeft: 8 }}>
                      凝聚 {matchedFaction.cohesionScore.toFixed(2)}
                    </span>
                  )}
                </div>
                {c.topMembers.length > 0 && (
                  <div
                    className="text-[11px] truncate mt-1"
                    style={{ color: 'var(--fg-secondary)' }}
                  >
                    {c.topMembers.map((m) => m.name).join(' · ')}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Faction settings */}
      {isCommunityMode && factionSettings && onFactionSettingsChange && (
        <FactionSettingsSection
          settings={factionSettings}
          onChange={onFactionSettingsChange}
          onRecompute={onFactionRecompute}
          isRecomputing={isRecomputing}
        />
      )}

      {/* Unaffiliated list */}
      {isCommunityMode &&
        factionAnalysis?.unaffiliatedNames &&
        factionAnalysis.unaffiliatedNames.length > 0 && (
          <div
            className="mt-3 p-2 rounded text-[11px]"
            style={{
              border: '1px dashed var(--border)',
              color: 'var(--fg-muted)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            {t('v1.cluster.unaffiliated', {
              n: factionAnalysis.unaffiliatedNames.length,
              defaultValue: '無派系 ({{n}})',
            })}
            ：{factionAnalysis.unaffiliatedNames.slice(0, 6).join(' · ')}
            {factionAnalysis.unaffiliatedNames.length > 6 && '…'}
          </div>
        )}
    </PanelShell>
  );
}

// ── Composition mini-dot stack ──────────────────────────────────────────────

function CompositionStack({ composition }: { composition: Array<[EntityType, number]> }) {
  return (
    <span
      className="inline-flex items-center"
      style={{ flexShrink: 0 }}
    >
      {composition.map(([type], idx) => (
        <span
          key={type}
          className="rounded-full"
          style={{
            width: 10,
            height: 10,
            marginLeft: idx === 0 ? 0 : -3,
            border: '1.5px solid var(--bg-primary)',
            backgroundColor: `var(--entity-${dotKey(type)}-dot)`,
          }}
        />
      ))}
    </span>
  );
}

// ── Faction settings (resolution / min cluster size) ────────────────────────

interface FactionSettingsSectionProps {
  settings: FactionSettings;
  onChange: (next: FactionSettings) => void;
  onRecompute?: () => void;
  isRecomputing?: boolean;
}

function FactionSettingsSection({
  settings,
  onChange,
  onRecompute,
  isRecomputing,
}: FactionSettingsSectionProps) {
  const { t } = useTranslation('graph');
  const [open, setOpen] = useState(true);

  return (
    <div
      className="mt-3 pt-3"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 w-full text-left mb-2"
        style={{
          fontSize: 11,
          color: 'var(--fg-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          background: 'none',
          border: 0,
          padding: 0,
        }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {t('v1.cluster.settings.heading', { defaultValue: '群集設定' })}
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          <SettingRow label={t('v1.cluster.settings.algorithm', { defaultValue: '偵測算法' })}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--fg-secondary)',
              }}
            >
              greedy_modularity
            </span>
          </SettingRow>

          <SettingRow label={t('v1.cluster.settings.resolution', { defaultValue: '解析度' })}>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.1}
              value={settings.resolution}
              onChange={(e) =>
                onChange({ ...settings, resolution: Number(e.target.value) })
              }
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--fg-secondary)',
                minWidth: 26,
                textAlign: 'right',
              }}
            >
              {settings.resolution.toFixed(1)}
            </span>
          </SettingRow>

          <SettingRow
            label={t('v1.cluster.settings.minSize', { defaultValue: '最小群集大小' })}
          >
            <button
              onClick={() =>
                onChange({
                  ...settings,
                  minClusterSize: Math.max(2, settings.minClusterSize - 1),
                })
              }
              style={miniBtnStyle}
              aria-label="decrease"
            >
              −
            </button>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--fg-primary)',
                minWidth: 20,
                textAlign: 'center',
              }}
            >
              ≥ {settings.minClusterSize}
            </span>
            <button
              onClick={() =>
                onChange({
                  ...settings,
                  minClusterSize: Math.min(20, settings.minClusterSize + 1),
                })
              }
              style={miniBtnStyle}
              aria-label="increase"
            >
              +
            </button>
          </SettingRow>

          {onRecompute && (
            <button
              onClick={onRecompute}
              disabled={isRecomputing}
              className="flex items-center gap-1 mt-1"
              style={{
                fontSize: 11,
                color: isRecomputing ? 'var(--fg-muted)' : 'var(--accent)',
                background: 'none',
                border: 0,
                padding: 0,
                cursor: isRecomputing ? 'wait' : 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              <RotateCw size={11} className={isRecomputing ? 'animate-spin' : ''} />
              {t('v1.cluster.settings.recompute', { defaultValue: '重新運算' })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const miniBtnStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--fg-secondary)',
  fontSize: 12,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
      <span style={{ flex: 1, color: 'var(--fg-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

// ── Drill-in panel ──────────────────────────────────────────────────────────

interface DrillInPanelProps {
  clustered: ClusteredGraph | null;
  drillInType: string;
  nodeMap: Map<string, GraphNode>;
  sortKey: SortKey;
  setSortKey: (fn: (k: SortKey) => SortKey) => void;
  onClose: () => void;
  onExitDrillIn: () => void;
  onMemberSelect?: (id: string) => void;
  factionAnalysis?: FactionAnalysisResponse | null;
}

function DrillInPanel({
  clustered,
  drillInType,
  nodeMap,
  sortKey,
  setSortKey,
  onClose,
  onExitDrillIn,
  onMemberSelect,
  factionAnalysis,
}: DrillInPanelProps) {
  const { t } = useTranslation('graph');
  const cluster = clustered?.superNodes.find((c) => c.clusterType === drillInType);
  if (!cluster) return null;

  const members = cluster.memberIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is GraphNode => !!n);
  const sorted = [...members].sort((a, b) => {
    if (sortKey === 'importance') return b.chunkCount - a.chunkCount;
    return a.name.localeCompare(b.name);
  });

  const composition = factionAnalysis ? compositionOf(cluster.memberIds, nodeMap) : null;
  const matchedFaction = factionAnalysis?.factions?.find(
    (f) => `cluster:${f.id}` === cluster.id,
  );
  const outwardRelations = factionAnalysis && matchedFaction
    ? (factionAnalysis.relations ?? []).filter(
        (r) =>
          r.sourceFactionId === matchedFaction.id ||
          r.targetFactionId === matchedFaction.id,
      )
    : [];

  const drillTitle = cluster.label
    ? t('v1.cluster.drillInFactionTitle', {
        name: cluster.label,
        n: cluster.count,
        defaultValue: '{{name}} · {{n}} 名成員',
      })
    : t('v1.cluster.drillInTitle', {
        typeName: t(`entityTypes.${drillInType}`),
        n: cluster.count,
      });

  return (
    <PanelShell
      title={drillTitle}
      titleAccent={
        composition ? (
          <CompositionStack composition={composition} />
        ) : (
          <span
            className="inline-block rounded-full"
            style={{
              width: 10,
              height: 10,
              backgroundColor: `var(--entity-${dotKey(drillInType)}-dot)`,
            }}
          />
        )
      }
      onClose={onClose}
      onBack={onExitDrillIn}
    >
      {/* Faction summary */}
      {matchedFaction && (
        <div className="mb-3">
          <SectionHead label={t('v1.cluster.drillIn.summary', { defaultValue: '群集摘要' })} />
          <p
            className="leading-relaxed mt-1"
            style={{
              color: 'var(--fg-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {t('v1.cluster.drillIn.summaryBody', {
              n: matchedFaction.memberIds?.length ?? 0,
              top: (matchedFaction.topMemberNames ?? []).slice(0, 2).join('、'),
              cohesion: matchedFaction.cohesionScore.toFixed(2),
              defaultValue:
                '本派系含 {{n}} 名角色，核心成員為 {{top}}；凝聚度 {{cohesion}}。',
            })}
          </p>
        </div>
      )}

      {/* Members */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <SectionHead
            label={t('v1.cluster.members', { n: cluster.count })}
            tail={
              <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                {sortKey === 'importance'
                  ? t('v1.cluster.sortImportance')
                  : t('v1.cluster.sortName')}
              </span>
            }
          />
          <button
            onClick={() => setSortKey((k) => (k === 'importance' ? 'name' : 'importance'))}
            className="flex items-center gap-1 text-[11px]"
            style={{
              color: 'var(--fg-secondary)',
              background: 'none',
              border: 0,
              padding: 0,
              cursor: 'pointer',
            }}
            title={t('v1.cluster.toggleSort', { defaultValue: '切換排序' })}
          >
            <ArrowUpDown size={11} />
          </button>
        </div>
        <ul className="space-y-1">
          {sorted.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => onMemberSelect?.(n.id)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs"
                style={{ color: 'var(--fg-primary)', background: 'transparent', border: 0 }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    flexShrink: 0,
                    backgroundColor: `var(--entity-${dotKey(n.type)}-dot)`,
                  }}
                />
                <span className="truncate text-left flex-1">{n.name}</span>
                <span
                  className="tabular-nums text-[10px]"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  {n.chunkCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Outward relations */}
      {factionAnalysis && matchedFaction && outwardRelations.length > 0 && (
        <div>
          <SectionHead
            label={t('v1.cluster.drillIn.outward', {
              n: outwardRelations.length,
              defaultValue: '對外關係（{{n}}）',
            })}
          />
          <ul className="space-y-1 mt-2">
            {outwardRelations.map((rel) => {
              const otherId =
                rel.sourceFactionId === matchedFaction.id
                  ? rel.targetFactionId
                  : rel.sourceFactionId;
              const otherFaction = factionAnalysis.factions?.find((f) => f.id === otherId);
              if (!otherFaction) return null;
              return (
                <li
                  key={`${rel.sourceFactionId}-${rel.targetFactionId}`}
                  className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--fg-secondary)',
                  }}
                >
                  <span
                    className="font-semibold"
                    style={{ color: 'var(--fg-primary)' }}
                  >
                    {otherFaction.label}
                  </span>
                  {rel.cooperation > 0 && (
                    <span style={{ color: 'var(--fg-muted)' }}>
                      合作 {rel.cooperation.toFixed(2)}
                    </span>
                  )}
                  {rel.rivalry > 0 && (
                    <span style={{ color: 'var(--color-error)' }}>
                      敵對 {rel.rivalry.toFixed(2)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PanelShell>
  );
}

// ── Shared shell ────────────────────────────────────────────────────────────

interface PanelShellProps {
  title: string;
  titleAccent?: React.ReactNode;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}

function PanelShell({ title, titleAccent, onClose, onBack, children }: PanelShellProps) {
  const { t } = useTranslation('graph');
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between p-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="text-[11px]"
              style={{
                color: 'var(--fg-muted)',
                background: 'none',
                border: 0,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              ← {t('v1.cluster.back')}
            </button>
          )}
          {titleAccent}
          <h3
            className="text-sm font-semibold truncate"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
          >
            {title}
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            color: 'var(--fg-muted)',
            background: 'none',
            border: 0,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

function SectionHead({
  label,
  tail,
}: {
  label: string;
  tail?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-1"
      style={{
        fontSize: 11,
        color: 'var(--fg-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 600,
      }}
    >
      <ChevronDown size={11} />
      {label}
      {tail && <span style={{ marginLeft: 'auto' }}>{tail}</span>}
    </div>
  );
}
