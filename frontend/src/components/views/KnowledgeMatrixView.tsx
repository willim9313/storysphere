import { useMemo, useState, type CSSProperties } from 'react';
import { useEvidenceByType } from '@/api/evidence';
import { useChapters } from '@/api/runs';
import { useViewEvidence } from './knowledge/useViewEvidence';
import { ViewStatus } from './knowledge/ViewStatus';
import type { ViewProps } from './types';

interface Misbelief {
  belief: string;
  truth: string;
  sourceEventId: string | null;
  confidence: number | null;
}

interface Cell {
  evidenceId: string;
  characterId: string;
  chapter: number;
  known: number;
  unknown: number;
  misbeliefs: Misbelief[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

function toCell(id: string, content: Record<string, unknown>): Cell | null {
  const characterId = str(content.characterId);
  const chapter = content.upToChapter;
  if (!characterId || typeof chapter !== 'number') return null;
  const misbeliefs = (Array.isArray(content.misbeliefs) ? content.misbeliefs : []).map((m: Record<string, unknown>) => ({
    belief: str(m.belief),
    truth: str(m.truth),
    sourceEventId: str(m.sourceEventId) || null,
    confidence: typeof m.confidence === 'number' ? m.confidence : null,
  }));
  return { evidenceId: id, characterId, chapter, known: len(content.knownEventIds), unknown: len(content.unknownEventIds), misbeliefs };
}

// 深淺分 5 階（0–20%…80–100%），用 accent 混透明；不寫色碼。
const STEPS = [12, 28, 46, 66, 88];
const stepOf = (ratio: number) => Math.min(STEPS.length - 1, Math.floor(ratio * STEPS.length));
const shade = (step: number) => `color-mix(in srgb, var(--accent) ${STEPS[step]}%, transparent)`;

const CELL_MIN = 'minmax(44px, 1fr)';
const headStyle: CSSProperties = {
  fontSize: 'var(--font-size-2xs)',
  color: 'var(--fg-muted)',
  textAlign: 'center',
  padding: 'var(--space-1) 0',
};

/** `knowledge_matrix`（CH5）：角色 × 章的知情矩陣（05 §4.1）。 */
export function KnowledgeMatrixView({ bookId, evidenceIds, onSelectEvidence }: Readonly<ViewProps>) {
  const { items, labels, isLoading, error } = useViewEvidence(bookId, 'knowledge_matrix', 'belief_state', evidenceIds);
  const chapters = useChapters(bookId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 指定證據時事件標題已在 referenced；否則點了格子才抓第 1 層 event。
  const events = useEvidenceByType(bookId, ['event'], {
    includeL1: true,
    enabled: evidenceIds === undefined && selectedId !== null,
  });

  const { rows, columns, cells } = useMemo(() => {
    const cellMap = new Map<string, Cell>();
    const rowIds: string[] = [];
    const cols = new Set<number>();
    for (const e of items) {
      const cell = toCell(e.id, e.content);
      if (!cell) continue;
      if (!rowIds.includes(cell.characterId)) rowIds.push(cell.characterId);
      cols.add(cell.chapter);
      cellMap.set(`${cell.characterId}:${cell.chapter}`, cell);
    }
    return { rows: rowIds, columns: [...cols].sort((a, b) => a - b), cells: cellMap };
  }, [items]);

  if (isLoading || error || rows.length === 0) {
    return <ViewStatus isLoading={isLoading} error={error} empty="還沒有知情狀態的證據。" />;
  }

  const chapterTitle = new Map((chapters.data ?? []).map((c) => [c.number, c.title]));
  const nameOf = (id: string) => labels.get(id) ?? '未知角色';
  const selected = [...cells.values()].find((c) => c.evidenceId === selectedId) ?? null;

  const eventTitle = (id: string) => {
    const ref = labels.get(id);
    if (ref) return ref;
    const ev = events.data?.find((e) => e.id === id);
    return ev ? str(ev.content?.title) || ev.summary : null;
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ overflowX: 'auto' }}>
          <div
            role="table"
            aria-label="角色知情矩陣"
            style={{
              display: 'grid',
              gridTemplateColumns: `minmax(96px, max-content) repeat(${columns.length}, ${CELL_MIN})`,
              gap: 'var(--space-1)',
              minWidth: 'max-content',
            }}
          >
            <div role="row" style={{ display: 'contents' }}>
              <span role="columnheader" style={{ ...headStyle, textAlign: 'left' }}>
                角色 ＼ 章
              </span>
              {columns.map((ch) => (
                <span key={ch} role="columnheader" style={headStyle} title={chapterTitle.get(ch) ?? undefined}>
                  {ch}
                </span>
              ))}
            </div>
            {rows.map((charId) => (
              <div key={charId} role="row" style={{ display: 'contents' }}>
                <span
                  role="rowheader"
                  title={nameOf(charId)}
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--fg-primary)',
                    alignSelf: 'center',
                    maxWidth: '10em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingRight: 'var(--space-2)',
                  }}
                >
                  {nameOf(charId)}
                </span>
                {columns.map((ch) => {
                  const cell = cells.get(`${charId}:${ch}`);
                  if (!cell) return <span key={ch} role="cell" style={{ minHeight: 36 }} />;
                  const total = cell.known + cell.unknown;
                  const ratio = total === 0 ? 0 : cell.known / total;
                  const step = stepOf(ratio);
                  const isSel = cell.evidenceId === selectedId;
                  return (
                    <span key={ch} role="cell">
                      <button
                        type="button"
                        aria-label={`${nameOf(charId)} 到第 ${ch} 章：已知 ${cell.known}／${total} 個事件${
                          cell.misbeliefs.length ? `，錯誤認知 ${cell.misbeliefs.length} 則` : ''
                        }`}
                        aria-pressed={isSel}
                        onClick={() => {
                          setSelectedId(cell.evidenceId);
                          onSelectEvidence?.(cell.evidenceId);
                        }}
                        style={{
                          all: 'unset',
                          boxSizing: 'border-box',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          height: 36,
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-sm)',
                          background: shade(step),
                          border: 'var(--border-width) var(--border-style) var(--border)',
                          outline: isSel ? 'var(--focus-ring-width) solid var(--focus-ring-color)' : undefined,
                          outlineOffset: 1,
                          fontSize: 'var(--font-size-2xs)',
                          fontVariantNumeric: 'tabular-nums',
                          color: step >= 3 ? 'var(--accent-fg)' : 'var(--fg-secondary)',
                        }}
                      >
                        {Math.round(ratio * 100)}
                        {cell.misbeliefs.length > 0 && <MisbeliefMark />}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <Legend />
      </div>

      <aside
        aria-live="polite"
        style={{
          flex: '0 1 300px',
          minWidth: 240,
          padding: 'var(--space-4)',
          border: 'var(--border-width) var(--border-style) var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        {selected ? (
          <>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)', fontWeight: 600 }}>
              {nameOf(selected.characterId)}・到第 {selected.chapter} 章
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
              已知 {selected.known} 個事件、不知道 {selected.unknown} 個
            </div>
            {selected.misbeliefs.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>這一章沒有錯誤認知。</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {selected.misbeliefs.map((m, i) => {
                  const title = m.sourceEventId ? eventTitle(m.sourceEventId) : null;
                  return (
                    <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>
                      <span style={{ color: 'var(--fg-muted)' }}>以為</span>
                      <span style={{ color: 'var(--fg-primary)' }}>{m.belief}</span>
                      <span style={{ color: 'var(--fg-muted)' }}>其實</span>
                      <span style={{ color: 'var(--fg-primary)' }}>{m.truth}</span>
                      {m.sourceEventId && (
                        <span style={{ color: 'var(--fg-secondary)' }}>
                          來源事件：
                          {title ?? (events.isLoading ? '讀取中…' : '（找不到事件）')}
                        </span>
                      )}
                      {m.confidence !== null && (
                        <span style={{ color: 'var(--fg-muted)' }}>信心 {m.confidence.toFixed(2)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
            點一格看該角色到那一章的錯誤認知。
          </p>
        )}
      </aside>
    </div>
  );
}

function MisbeliefMark() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 3,
        right: 3,
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'var(--color-warning)',
        boxShadow: '0 0 0 1px var(--bg-primary)',
      }}
    />
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        已知比例
        {STEPS.map((_, i) => (
          <span
            key={i}
            title={`${i * 20}–${(i + 1) * 20}%`}
            style={{
              width: 18,
              height: 12,
              borderRadius: 'var(--radius-sm)',
              background: shade(i),
              border: 'var(--border-width) var(--border-style) var(--border)',
            }}
          />
        ))}
        <span>0 → 100%</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <span style={{ position: 'relative', width: 13, height: 13 }}>
          <MisbeliefMark />
        </span>
        有錯誤認知
      </span>
      <span>格內數字＝到該章已知事件數／全部事件數（%）</span>
    </div>
  );
}
