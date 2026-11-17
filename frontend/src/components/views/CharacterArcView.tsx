import { useMemo, useState, type CSSProperties } from 'react';
import { useChapters } from '@/api/runs';
import { assignLanes, type Segment } from './arc/lanes';
import { useViewEvidence } from './knowledge/useViewEvidence';
import { ViewStatus } from './knowledge/ViewStatus';
import type { ViewProps } from './types';

const CAT_COUNT = 5; // tokens.css 的 --cat-1…--cat-5
const LANE_HEIGHT = 30;

function toSegment(id: string, content: Record<string, unknown>): Segment | null {
  const { characterId, chapterStart, chapterEnd, phase, description } = content;
  if (typeof characterId !== 'string' || typeof chapterStart !== 'number' || typeof chapterEnd !== 'number') return null;
  return {
    id,
    characterId,
    start: Math.min(chapterStart, chapterEnd),
    end: Math.max(chapterStart, chapterEnd),
    phase: typeof phase === 'string' ? phase : '',
    description: typeof description === 'string' ? description : '',
  };
}

const headStyle: CSSProperties = {
  fontSize: 'var(--font-size-2xs)',
  color: 'var(--fg-muted)',
  textAlign: 'center',
  padding: 'var(--space-1) 0',
};

/** `character_arc`（CH2）：每個角色一條章節橫軸，弧線段為色塊（05 §4.1）。 */
export function CharacterArcView({ bookId, evidenceIds, onSelectEvidence }: Readonly<ViewProps>) {
  const { items, labels, isLoading, error } = useViewEvidence(bookId, 'character_arc', 'arc_segment', evidenceIds);
  const chapters = useChapters(bookId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const segments = useMemo(
    () => items.map((e) => toSegment(e.id, e.content)).filter((s): s is Segment => s !== null),
    [items],
  );
  const rows = useMemo(() => assignLanes(segments), [segments]);

  if (isLoading || error || segments.length === 0) {
    return <ViewStatus isLoading={isLoading} error={error} empty="還沒有角色弧線的證據。" />;
  }

  // 章節軸 1..N：N 取正文最後一章與弧線段最遠一章的較大者。
  const bodyChapters = (chapters.data ?? []).filter((c) => c.role === 'body').map((c) => c.number);
  const axisStart = Math.min(1, ...segments.map((s) => s.start));
  const axisEnd = Math.max(axisStart, ...bodyChapters, ...segments.map((s) => s.end));
  const axis = Array.from({ length: axisEnd - axisStart + 1 }, (_, i) => axisStart + i);
  const chapterTitle = new Map((chapters.data ?? []).map((c) => [c.number, c.title]));
  const nameOf = (id: string) => labels.get(id) ?? '未知角色';
  const selected = segments.find((s) => s.id === selectedId) ?? null;

  // 第 1 列是章節標頭；每個角色從前面角色的 lane 數累加後的那一列開始。
  const placed = rows.map((row, i) => ({
    ...row,
    firstRow: 2 + rows.slice(0, i).reduce((sum, r) => sum + r.laneCount, 0),
    cat: (i % CAT_COUNT) + 1,
  }));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 480px', minWidth: 0, overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(96px, max-content) repeat(${axis.length}, minmax(40px, 1fr))`,
            gridAutoRows: LANE_HEIGHT,
            columnGap: 2,
            rowGap: 'var(--space-1)',
            minWidth: 'max-content',
          }}
        >
          <span style={{ ...headStyle, gridRow: 1, gridColumn: 1, textAlign: 'left' }}>角色 ＼ 章</span>
          {axis.map((ch, i) => (
            <span key={ch} style={{ ...headStyle, gridRow: 1, gridColumn: i + 2 }} title={chapterTitle.get(ch) ?? undefined}>
              {ch}
            </span>
          ))}

          {placed.map((row, i) => {
            const rowSpan = `${row.firstRow} / span ${row.laneCount}`;
            return [
              <span
                key={`${row.characterId}-name`}
                title={nameOf(row.characterId)}
                style={{
                  gridRow: rowSpan,
                  gridColumn: 1,
                  alignSelf: 'center',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--fg-primary)',
                  maxWidth: '10em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingRight: 'var(--space-2)',
                }}
              >
                {nameOf(row.characterId)}
              </span>,
              <span
                key={`${row.characterId}-track`}
                aria-hidden="true"
                style={{
                  gridRow: rowSpan,
                  gridColumn: `2 / span ${axis.length}`,
                  background: i % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              />,
              ...row.segments.map(({ segment: s, lane }) => {
                const isSel = s.id === selectedId;
                const span = s.start === s.end ? `第 ${s.start} 章` : `第 ${s.start}–${s.end} 章`;
                return (
                  <button
                    key={s.id}
                    type="button"
                    title={`${s.phase || '（未標階段）'}・${span}`}
                    aria-label={`${nameOf(row.characterId)}，${span}：${s.phase || '未標階段'}`}
                    aria-pressed={isSel}
                    onClick={() => {
                      setSelectedId(s.id);
                      onSelectEvidence?.(s.id);
                    }}
                    style={{
                      all: 'unset',
                      boxSizing: 'border-box',
                      gridRow: row.firstRow + lane,
                      gridColumn: `${s.start - axisStart + 2} / ${s.end - axisStart + 3}`,
                      minWidth: 0,
                      margin: '2px 0',
                      padding: '0 var(--space-2)',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      background: `var(--cat-${row.cat})`,
                      color: `var(--cat-${row.cat}-fg)`,
                      outline: isSel ? 'var(--focus-ring-width) solid var(--focus-ring-color)' : undefined,
                      outlineOffset: 1,
                      fontSize: 'var(--font-size-2xs)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.phase || '—'}
                  </button>
                );
              }),
            ];
          })}
        </div>
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
          gap: 'var(--space-2)',
        }}
      >
        {selected ? (
          <>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)', fontWeight: 600 }}>
              {nameOf(selected.characterId)}・{selected.phase || '未標階段'}
            </div>
            <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
              {selected.start === selected.end ? `第 ${selected.start} 章` : `第 ${selected.start}–${selected.end} 章`}
            </div>
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-primary)', lineHeight: 1.7 }}>
              {selected.description || '（沒有描述）'}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>點一段看這段弧線的描述。</p>
        )}
      </aside>
    </div>
  );
}
