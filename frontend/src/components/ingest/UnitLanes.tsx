import { useIngestUnits, type UnitItem, type UnitStage } from '@/api/ingest';
import { STAGE_LABEL } from './labels';

// 畫布 Ingest.dc.html 的格子樣式；只用 token。
const CELL: Record<string, { glyph: string; bg: string; fg: string; edge: string; label: string }> = {
  done: { glyph: '', bg: 'var(--accent)', fg: 'var(--accent-fg)', edge: 'var(--accent)', label: '完成' },
  running: { glyph: '◐', bg: 'var(--bg-primary)', fg: 'var(--accent)', edge: 'var(--accent)', label: '執行中' },
  failed: { glyph: '✕', bg: 'var(--color-error-bg)', fg: 'var(--color-error)', edge: 'var(--color-error)', label: '失敗' },
  paused: { glyph: '‖', bg: 'var(--bg-secondary)', fg: 'var(--fg-muted)', edge: 'var(--border)', label: '暫停' },
  pending: { glyph: '', bg: 'var(--bg-primary)', fg: 'var(--fg-muted)', edge: 'var(--border)', label: '等待' },
};

function Lane({
  bookId,
  stage,
  paused,
}: Readonly<{ bookId: string; stage: UnitStage; paused: boolean }>) {
  const { data: units = [], isError } = useIngestUnits(bookId, stage, true);
  // 04 N-02b：job 暫停時，非 done 的格子畫成「暫停」，不另存狀態。
  const kind = (unit: UnitItem) =>
    paused && unit.status !== 'done' && unit.status !== 'failed' ? 'paused' : unit.status;
  const count = (status: string) => units.filter((unit) => kind(unit) === status).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          fontSize: 'var(--font-size-xs)',
        }}
      >
        <span style={{ color: 'var(--fg-secondary)', fontWeight: 600 }}>{STAGE_LABEL[stage]}</span>
        <span style={{ color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {isError
            ? '讀取失敗'
            : `${count('done')} 完成 · ${count('running')} 執行中 · ${count('failed')} 失敗 · 共 ${units.length}`}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(22px, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        {units.map((unit) => {
          const cell = CELL[kind(unit)] ?? CELL.pending;
          const title = `第 ${unit.chapter} 章 · ${unit.unitId} · ${cell.label}${
            unit.attempts > 1 ? ` · 試了 ${unit.attempts} 次` : ''
          }${unit.error ? ` · ${unit.error}` : ''}`;
          return (
            <span
              key={unit.unitId}
              title={title}
              aria-label={title}
              style={{
                height: 22,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--font-size-2xs)',
                lineHeight: 1,
                border: `var(--border-width) solid ${cell.edge}`,
                background: cell.bg,
                color: cell.fg,
              }}
            >
              {cell.glyph}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** S1／S4 的單位格狀圖（N-02b）；只畫有單位的 stage。 */
export function UnitLanes({
  bookId,
  stages,
  paused,
}: Readonly<{ bookId: string; stages: UnitStage[]; paused: boolean }>) {
  return (
    <>
      {stages.map((stage) => (
        <Lane key={stage} bookId={bookId} stage={stage} paused={paused} />
      ))}
    </>
  );
}
