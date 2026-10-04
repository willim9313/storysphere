import { useMemo, useState } from 'react';
import { X, ChevronRight, ChevronDown, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FactionAnalysisResponse } from '@/api/factions';
import type { EntityType, GraphNode } from '@/api/types';
import type { ClusteredGraph } from '@/services/kgClustering';
import { deriveFactionLabel } from '@/services/kgClustering';

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

const ENTITY_ORDER: EntityType[] = [
  'character',
  'location',
  'concept',
  'event',
  'organization',
  'object',
  'other',
];

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
  return ENTITY_ORDER.filter((t) => counts.has(t)).map((t) => [t, counts.get(t)!] as [EntityType, number]);
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
      {/* Community scope cards (此檢視範圍 / 怎麼分的) — pinned to the TOP of the
          panel and always visible, never folded into a tooltip. Without them the
          reader assumes factions were drawn by reading the plot. */}
      {isCommunityMode && <CommunityScopeCard />}

      {/* Cluster rows — name, {n} members, cohesion (community), top 3 names.
          No 「⋯更多」 at the end: the backend's topMemberNames cap is 3, so that
          would promise a 4th name that is not there. */}
      <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        {overviewClusters.map((c) => {
          const matchedFaction = factionAnalysis?.factions?.find((f) => `cluster:${f.id}` === c.id);
          const composition = isCommunityMode ? compositionOf(c.memberIds, nodeMap) : null;
          const title = c.label ?? t(`entityTypes.${c.clusterType}`);

          return (
            <button key={c.id} type="button" onClick={() => onDrillIn(c.clusterType)} className="kg-crow">
              <span className="kg-crow-head">
                {!composition && (
                  <span className="kg-dot" style={{ background: `var(--entity-${dotKey(c.clusterType)}-dot)` }} />
                )}
                <span className="kg-crow-name">{title}</span>
                <span className="kg-crow-meta">
                  {composition
                    ? t('v1.cluster.communityRowCount', {
                        n: c.count,
                        composition: composition
                          .map(([type, n]) => `${t(`v1.cluster.compositionAbbr.${type}`)}${n}`)
                          .join(' / '),
                      })
                    : t('v1.cluster.members', { n: c.count })}
                </span>
                {matchedFaction && (
                  <span className="kg-crow-cohesion">
                    {t('v1.cluster.cohesion', { score: matchedFaction.cohesionScore.toFixed(2) })}
                  </span>
                )}
              </span>
              {c.topMembers.length > 0 && (
                <span className="kg-crow-tops">{c.topMembers.map((m) => m.name).join(' · ')}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Boundary declarations of this lens: who is not in any faction, and how
          many non-character entities never enter this view. */}
      {isCommunityMode && factionAnalysis && (
        <CommunityBoundary factionAnalysis={factionAnalysis} graphNodes={graphNodes} />
      )}

      {/* Faction settings */}
      {isCommunityMode && factionSettings && onFactionSettingsChange && (
        <FactionSettingsSection
          settings={factionSettings}
          onChange={onFactionSettingsChange}
          onRecompute={onFactionRecompute}
          isRecomputing={isRecomputing}
        />
      )}
    </PanelShell>
  );
}

// ── Community scope explanation card ────────────────────────────────────────

function CommunityScopeCard() {
  const { t } = useTranslation('graph');
  return (
    <div className="kg-scope">
      <span className="kg-label">{t('v1.cluster.communityScope.heading', { defaultValue: '此檢視範圍' })}</span>
      <p className="kg-text" style={{ color: 'var(--fg-primary)' }}>
        {t('v1.cluster.communityScope.explain', {
          defaultValue: '分群僅計入角色之間的正向關係（如結盟、家族、友誼）。',
        })}
      </p>
      <p className="kg-text">
        {t('v1.cluster.communityScope.mechanism', {
          defaultValue:
            '怎麼分的：Newman modularity（模組度）演算法，讓群內連結盡量密、群間連結盡量疏——純粹依關係密度運算，不判讀情節或立場。',
        })}
      </p>
    </div>
  );
}

function CommunityBoundary({
  factionAnalysis,
  graphNodes,
}: {
  factionAnalysis: FactionAnalysisResponse;
  graphNodes: GraphNode[];
}) {
  const { t } = useTranslation('graph');
  const unaffiliatedNames = factionAnalysis.unaffiliatedNames ?? [];
  const clusteredCount = (factionAnalysis.factions ?? []).reduce(
    (sum, f) => sum + (f.memberIds?.length ?? 0),
    0,
  );
  const otherEntityCount = Math.max(0, graphNodes.length - clusteredCount);
  if (unaffiliatedNames.length === 0 && otherEntityCount === 0) return null;

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
      {unaffiliatedNames.length > 0 && (
        <span className="kg-label">
          {t('v1.cluster.unaffiliated', {
            n: unaffiliatedNames.length,
            defaultValue: '無派系 ({{n}})',
          })}
          ：{unaffiliatedNames.slice(0, 6).join(' · ')}
          {unaffiliatedNames.length > 6 && '…'}
        </span>
      )}
      {otherEntityCount > 0 && (
        <span className="kg-note">
          {t('v1.cluster.communityScope.otherEntities', {
            n: otherEntityCount,
            defaultValue: '{{n}} 個非角色/未分群實體不在此檢視',
          })}
        </span>
      )}
    </div>
  );
}

// ── Faction settings (resolution / min cluster size) ────────────────────────
// 四項：偵測算法（只顯示現值——後端不收算法參數）、解析度、最小群集大小、
// 重新運算（同步、零成本，不掛 LLM 字符）。

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
  const [open, setOpen] = useState(false);

  return (
    <div className="kg-settings">
      <button type="button" onClick={() => setOpen((o) => !o)} className="kg-settings-toggle" aria-expanded={open}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {t('v1.cluster.settings.heading', { defaultValue: '進階：群集設定' })}
      </button>

      {open && (
        <>
          <div className="kg-setting-row">
            <span className="kg-setting-key">{t('v1.cluster.settings.algorithm', { defaultValue: '偵測算法' })}</span>
            <span className="kg-setting-val">greedy_modularity</span>
          </div>

          <div className="kg-setting-row">
            <span className="kg-setting-key">{t('v1.cluster.settings.resolution', { defaultValue: '解析度' })}</span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.1}
              value={settings.resolution}
              onChange={(e) => onChange({ ...settings, resolution: Number(e.target.value) })}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span className="kg-setting-val" style={{ minWidth: 26, textAlign: 'right' }}>
              {settings.resolution.toFixed(1)}
            </span>
          </div>

          <div className="kg-setting-row">
            <span className="kg-setting-key">{t('v1.cluster.settings.minSize', { defaultValue: '最小群集大小' })}</span>
            <button
              type="button"
              className="kg-stepper"
              onClick={() => onChange({ ...settings, minClusterSize: Math.max(2, settings.minClusterSize - 1) })}
              aria-label="decrease"
            >
              −
            </button>
            <span className="kg-setting-val" style={{ minWidth: 20, textAlign: 'center', color: 'var(--fg-primary)' }}>
              ≥ {settings.minClusterSize}
            </span>
            <button
              type="button"
              className="kg-stepper"
              onClick={() => onChange({ ...settings, minClusterSize: Math.min(20, settings.minClusterSize + 1) })}
              aria-label="increase"
            >
              +
            </button>
          </div>

          {onRecompute && (
            <div className="kg-setting-row">
              <button
                type="button"
                onClick={onRecompute}
                disabled={isRecomputing}
                className="ss-btn ss-btn-sm ss-btn-secondary"
              >
                <RotateCw size={11} className={isRecomputing ? 'animate-spin' : ''} />
                {t('v1.cluster.settings.recompute', { defaultValue: '重新運算' })}
              </button>
              <span className="kg-note">{t('v1.cluster.settings.zeroCost')}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Drill-in panel ──────────────────────────────────────────────────────────

interface DrillInPanelProps {
  clustered: ClusteredGraph | null;
  drillInType: string;
  nodeMap: Map<string, GraphNode>;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
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
    <PanelShell title={drillTitle} onClose={onClose}>
      <div className="kg-drill-nav">
        <button type="button" onClick={onExitDrillIn} className="ss-btn ss-btn-sm ss-btn-ghost">
          ← {t('v1.cluster.back')}
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setSortKey('importance')}
          className={sortKey === 'importance' ? 'kg-sort is-on' : 'kg-sort'}
          aria-pressed={sortKey === 'importance'}
        >
          {t('v1.cluster.sortImportance')}
        </button>
        <button
          type="button"
          onClick={() => setSortKey('name')}
          className={sortKey === 'name' ? 'kg-sort is-on' : 'kg-sort'}
          aria-pressed={sortKey === 'name'}
        >
          {t('v1.cluster.sortName')}
        </button>
      </div>

      {/* Faction summary */}
      {matchedFaction && (
        <div className="kg-scope" style={{ background: 'var(--bg-secondary)' }}>
          <span className="kg-label">{t('v1.cluster.drillIn.summary', { defaultValue: '群集摘要' })}</span>
          <p className="kg-text">
            {t('v1.cluster.drillIn.summaryBody', {
              n: matchedFaction.memberIds?.length ?? 0,
              top: (matchedFaction.topMemberNames ?? []).slice(0, 2).join('、'),
              cohesion: matchedFaction.cohesionScore.toFixed(2),
              defaultValue: '本派系含 {{n}} 名角色，核心成員為 {{top}}；凝聚度 {{cohesion}}。',
            })}
          </p>
        </div>
      )}

      {/* Members */}
      <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        <span className="kg-label">{t('v1.cluster.members', { n: cluster.count })}</span>
        {sorted.map((n) => (
          <button key={n.id} type="button" onClick={() => onMemberSelect?.(n.id)} className="kg-member">
            <span className="kg-dot" style={{ background: `var(--entity-${dotKey(n.type)}-dot)` }} />
            <span style={{ flex: 1, minWidth: 0 }} className="truncate">
              {n.name}
            </span>
            <span className="kg-note" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {n.chunkCount}
            </span>
          </button>
        ))}
      </div>

      {/* Outward relations */}
      {factionAnalysis && matchedFaction && outwardRelations.length > 0 && (
        <section className="kg-section">
          <span className="kg-label">
            {t('v1.cluster.drillIn.outward', {
              n: outwardRelations.length,
              defaultValue: '對外關係（{{n}}）',
            })}
          </span>
          {outwardRelations.map((rel) => {
            const otherId =
              rel.sourceFactionId === matchedFaction.id ? rel.targetFactionId : rel.sourceFactionId;
            const otherFaction = factionAnalysis.factions?.find((f) => f.id === otherId);
            if (!otherFaction) return null;
            return (
              <div key={`${rel.sourceFactionId}-${rel.targetFactionId}`} className="kg-rel">
                <span className="kg-ir-name">
                  {deriveFactionLabel(otherFaction.topMemberNames, otherFaction.label)}
                </span>
                {rel.cooperation > 0 && (
                  <span style={{ color: 'var(--fg-muted)' }}>
                    {t('v1.cluster.rel.cooperation', { score: rel.cooperation.toFixed(2) })}
                  </span>
                )}
                {rel.rivalry > 0 && (
                  <span style={{ color: 'var(--color-error)' }}>
                    {t('v1.cluster.rel.rivalry', { score: rel.rivalry.toFixed(2) })}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}
    </PanelShell>
  );
}

// ── Shared shell ────────────────────────────────────────────────────────────

interface PanelShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function PanelShell({ title, onClose, children }: PanelShellProps) {
  return (
    <div className="kg-panel">
      <div className="kg-panel-head">
        <h3 className="kg-panel-title">{title}</h3>
        <button type="button" onClick={onClose} className="kg-icon-btn" aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="kg-panel-body">{children}</div>
    </div>
  );
}
