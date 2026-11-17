import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementDefinition, LayoutOptions, StylesheetJson } from 'cytoscape';
import { useEvidenceByType } from '@/api/evidence';
import { useViewData } from '@/api/runs';
import {
  referencedEvent,
  toCausalLink,
  toEvent,
  toEventRole,
  type CausalLink,
  type EventNode,
  type EventRole,
} from './graph/content';
import { DetailPanel, DetailRow, GraphFrame, GraphHeader, GraphStatus } from './graph/GraphParts';
import { colorToken, rawToken } from './graph/themeTokens';
import { useCytoscape } from './graph/useCytoscape';
import type { ViewProps } from './types';

const CLAIM_TYPES = ['event', 'causal_link', 'event_role'];

// 版面：每章一組直欄，同章依 textRank 由上而下排，滿 ROWS 個換下一欄；章與章之間空 CHAPTER_GAP。
const NODE_W = 120;
const NODE_H = 30;
const ROWS = 40;
const COL_GAP = 16;
const ROW_GAP = 8;
const CHAPTER_GAP = 72;

const PRESET: LayoutOptions = { name: 'preset', fit: true, padding: 24 };

interface GraphData {
  events: EventNode[];
  links: CausalLink[];
  roles: Map<string, EventRole>;
}

function useCausalData({ bookId, evidenceIds }: ViewProps) {
  const byType = useEvidenceByType(bookId, CLAIM_TYPES, { includeL1: true, enabled: !evidenceIds });
  const picked = useViewData(bookId, 'causal_graph', evidenceIds ? { evidenceIds } : {});
  const query = evidenceIds ? picked : byType;

  const data = useMemo<GraphData | null>(() => {
    const primary = evidenceIds ? picked.data?.primary : byType.data;
    if (!primary) return null;
    const events = new Map<string, EventNode>();
    const links: CausalLink[] = [];
    const roles = new Map<string, EventRole>();
    for (const item of primary) {
      if (item.claimType === 'event') events.set(item.id, toEvent(item));
      else if (item.claimType === 'causal_link') {
        const link = toCausalLink(item);
        if (link) links.push(link);
      } else if (item.claimType === 'event_role') {
        const role = toEventRole(item);
        if (role) roles.set(role.eventId, role);
      }
    }
    // 指定證據時，連結與角色指到的事件只在 referenced 裡（只有標題與章）。
    for (const ref of picked.data?.referenced ?? []) {
      if (evidenceIds && ref.claimType === 'event' && !events.has(ref.id)) events.set(ref.id, referencedEvent(ref));
    }
    return { events: [...events.values()], links: links.filter((l) => events.has(l.cause) && events.has(l.effect)), roles };
  }, [evidenceIds, picked.data, byType.data]);

  return { data, isLoading: query.isLoading, error: query.error };
}

/** x＝章（每章若干直欄），同章依 textRank 由上而下（05 §4.1）。 */
function buildElements({ events, links, roles }: GraphData): ElementDefinition[] {
  const sorted = [...events].sort(
    (a, b) =>
      (a.chapter ?? Infinity) - (b.chapter ?? Infinity) || (a.textRank ?? Infinity) - (b.textRank ?? Infinity),
  );
  const elements: ElementDefinition[] = [];
  let chapterX = 0;
  let index = 0;
  let prevChapter: number | null | undefined;
  for (const event of sorted) {
    if (event.chapter !== prevChapter) {
      if (prevChapter !== undefined) chapterX += (Math.floor((index - 1) / ROWS) + 1) * (NODE_W + COL_GAP) + CHAPTER_GAP;
      index = 0;
      elements.push({
        group: 'nodes',
        data: { id: `chapter:${event.chapter ?? 'none'}`, label: event.chapter === null ? '未標章' : `第 ${event.chapter} 章` },
        position: { x: chapterX, y: -NODE_H * 1.5 },
        classes: 'decor',
        selectable: false,
        grabbable: false,
      });
      prevChapter = event.chapter;
    }
    const role = roles.get(event.id);
    elements.push({
      group: 'nodes',
      data: { id: event.id, label: event.title },
      position: {
        x: chapterX + Math.floor(index / ROWS) * (NODE_W + COL_GAP),
        y: (index % ROWS) * (NODE_H + ROW_GAP),
      },
      classes: role ? role.weight : 'unrated',
    });
    index += 1;
  }
  for (const link of links) {
    elements.push({
      group: 'edges',
      data: { id: link.id, source: link.cause, target: link.effect, width: 0.75 + link.strength * 3 },
    });
  }
  return elements;
}

function buildStyle(): StylesheetJson {
  const fg = colorToken('--fg-primary');
  const muted = colorToken('--fg-muted');
  const border = colorToken('--border');
  const accent = colorToken('--accent');
  return [
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        width: NODE_W,
        height: NODE_H,
        'background-color': colorToken('--bg-primary'),
        'border-color': muted,
        'border-width': 1.5,
        label: 'data(label)',
        color: fg,
        'font-family': rawToken('--font-sans'),
        'font-size': 10,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'ellipsis',
        'text-max-width': `${NODE_W - 10}px`,
        'min-zoomed-font-size': 7,
      },
    },
    { selector: 'node.kernel', style: { 'border-width': 3.5, 'border-color': fg } },
    { selector: 'node.satellite', style: { 'border-width': 1, 'border-color': border } },
    {
      selector: 'node.decor',
      style: {
        width: 1,
        height: 1,
        'background-opacity': 0,
        'border-width': 0,
        color: muted,
        'font-size': 14,
        'text-halign': 'right',
        'text-max-width': '200px',
        'min-zoomed-font-size': 0,
        events: 'no',
      },
    },
    { selector: 'node:selected', style: { 'border-color': accent, 'background-color': colorToken('--bg-tertiary') } },
    { selector: '.hidden', style: { display: 'none' } },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': muted,
        'target-arrow-color': muted,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        opacity: 0.7,
      },
    },
  ];
}

/** `causal_graph`：事件 DAG（05 §4.1）。 */
export function CausalGraphView(props: Readonly<ViewProps>) {
  const { onSelectEvidence } = props;
  const { data, isLoading, error } = useCausalData(props);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kernelOnly, setKernelOnly] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const elements = useMemo(() => (data ? buildElements(data) : []), [data]);
  const eventById = useMemo(() => new Map(data?.events.map((e) => [e.id, e])), [data]);

  const onNodeTap = useCallback(
    (id: string) => {
      setSelectedId(id);
      onSelectEvidence?.(data?.roles.get(id)?.id ?? id);
    },
    [data, onSelectEvidence],
  );
  const onBackgroundTap = useCallback(() => setSelectedId(null), []);

  const cyRef = useCytoscape(containerRef, { elements, layout: PRESET, buildStyle, onNodeTap, onBackgroundTap });

  // 圖重建（資料重抓）後也要套用目前的開關。
  useEffect(() => {
    cyRef.current?.nodes('.satellite').toggleClass('hidden', kernelOnly);
  }, [cyRef, elements, kernelOnly]);

  const toggleKernelOnly = (next: boolean) => {
    setKernelOnly(next);
    if (next && selectedId && data?.roles.get(selectedId)?.weight === 'satellite') setSelectedId(null);
  };

  if (isLoading || error || !data || data.events.length === 0) {
    return <GraphStatus isLoading={isLoading} error={error} empty emptyText="這本書還沒有事件。" />;
  }

  const kernelCount = [...data.roles.values()].filter((r) => r.weight === 'kernel').length;
  const summary =
    `${data.events.length} 個事件、${data.links.length} 條因果連結` +
    (data.roles.size > 0 ? `；${kernelCount} 個核心事件、${data.roles.size - kernelCount} 個衛星事件` : '');
  const selected = selectedId ? eventById.get(selectedId) : undefined;
  const role = selectedId ? data.roles.get(selectedId) : undefined;

  return (
    <div>
      <GraphHeader summary={summary}>
        {data.roles.size > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--fg-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={kernelOnly} onChange={(e) => toggleKernelOnly(e.target.checked)} />
            只看核心事件
          </label>
        )}
      </GraphHeader>
      <GraphFrame>
        <div ref={containerRef} role="img" aria-label={`因果圖：${summary}`} style={{ position: 'absolute', inset: 0 }} />
        {selected && (
          <DetailPanel title={selected.title} onClose={() => setSelectedId(null)}>
            {selected.chapter !== null && <DetailRow label="章">第 {selected.chapter} 章</DetailRow>}
            {selected.description && <DetailRow label="描述">{selected.description}</DetailRow>}
            {role && (
              <DetailRow label={role.weight === 'kernel' ? '核心事件（kernel）' : '衛星事件（satellite）'}>
                {role.rationale}
              </DetailRow>
            )}
          </DetailPanel>
        )}
      </GraphFrame>
    </div>
  );
}
