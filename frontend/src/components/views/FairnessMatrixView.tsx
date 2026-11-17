import { useMemo, useState, type CSSProperties } from 'react';
import { useEvidenceByType } from '@/api/evidence';
import { useChapters } from '@/api/runs';
import { useViewEvidence } from './knowledge/useViewEvidence';
import { ViewStatus } from './knowledge/ViewStatus';
import type { ViewProps } from './types';

type Verdict = 'fair' | 'partially_fair' | 'unfair';

interface Violation {
  ruleSet: string;
  ruleNo: number;
  explanation: string;
}

interface Gap {
  evidenceId: string;
  truthId: string;
  verdict: Verdict;
  revealChapter: number | null;
  before: string[];
  visible: number;
  misdirection: number;
  violations: Violation[];
  gapDescription: string;
}

interface Clue {
  id: string;
  chapter: number | null;
  summary: string;
  visible: boolean;
  misdirection: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const VERDICTS: Record<Verdict, { label: string; className: string }> = {
  fair: { label: '公平', className: 'ss-badge ss-badge-success' },
  partially_fair: { label: '大致公平', className: 'ss-badge ss-badge-warning' },
  unfair: { label: '不公平', className: 'ss-badge ss-badge-error' },
};
const RULE_SET: Record<string, string> = { knox: 'Knox', van_dine: 'Van Dine' };

function toGap(id: string, c: Record<string, unknown>): Gap | null {
  const truthId = str(c.hiddenTruthId);
  const verdict = c.verdict as Verdict;
  if (!truthId || !(verdict in VERDICTS)) return null;
  const violations = (Array.isArray(c.violations) ? c.violations : []).map((v: Record<string, unknown>) => ({
    ruleSet: str(v.ruleSet),
    ruleNo: typeof v.ruleNo === 'number' ? v.ruleNo : 0,
    explanation: str(v.explanation),
  }));
  return {
    evidenceId: id,
    truthId,
    verdict,
    revealChapter: typeof c.revealChapter === 'number' ? c.revealChapter : null,
    before: Array.isArray(c.clueIdsBeforeReveal) ? (c.clueIdsBeforeReveal as string[]) : [],
    visible: typeof c.readerVisibleCount === 'number' ? c.readerVisibleCount : 0,
    misdirection: typeof c.misdirectionCount === 'number' ? c.misdirectionCount : 0,
    violations,
    gapDescription: str(c.gapDescription),
  };
}

const headStyle: CSSProperties = { fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', textAlign: 'center', padding: 'var(--space-1) 0' };
const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', lineHeight: 1.6 };

/** 一條線索的記號：實心＝讀者可見、空心＝讀者看不到、菱形＝誤導；揭曉後的線索淡化。 */
function ClueMark({ clue, afterReveal }: Readonly<{ clue: Clue; afterReveal: boolean }>) {
  const color = clue.misdirection ? 'var(--color-warning)' : 'var(--accent)';
  return (
    <span
      title={`${clue.summary}${clue.visible ? '' : '（讀者看不到）'}${clue.misdirection ? '（誤導）' : ''}`}
      style={{
        width: 8,
        height: 8,
        borderRadius: clue.misdirection ? 1 : '50%',
        transform: clue.misdirection ? 'rotate(45deg)' : undefined,
        background: clue.visible ? color : 'transparent',
        border: `1.5px solid ${color}`,
        opacity: afterReveal ? 0.35 : 1,
        flexShrink: 0,
      }}
    />
  );
}

/** `fairness_matrix`（MY4）：真相 × 章節；線索出現、是否讀者可見、是否誤導、揭曉點（05 §4.1）。 */
export function FairnessMatrixView({ bookId, evidenceIds, onSelectEvidence }: Readonly<ViewProps>) {
  const { items, isLoading, error } = useViewEvidence(bookId, 'fairness_matrix', 'fairness_gap', evidenceIds);
  // 真相的敘述與線索的章節、可見、誤導都在第 1 層。
  const truths = useEvidenceByType(bookId, ['hidden_truth'], { includeL1: true });
  const clueQuery = useEvidenceByType(bookId, ['clue_points_to'], { includeL1: true });
  const chapters = useChapters(bookId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const gaps = useMemo(() => items.map((e) => toGap(e.id, e.content)).filter((g): g is Gap => g !== null), [items]);
  const statement = useMemo(
    () => new Map((truths.data ?? []).map((t) => [t.id, str(t.content?.statement) || t.summary])),
    [truths.data],
  );
  const cluesByTruth = useMemo(() => {
    const map = new Map<string, Clue[]>();
    for (const c of clueQuery.data ?? []) {
      const truthId = str(c.content?.pointsToTruthId);
      if (!truthId) continue;
      const clue: Clue = {
        id: c.id,
        chapter: c.discourseChapter,
        summary: str(c.content?.clueSummary) || c.summary,
        visible: c.content?.readerVisible !== false,
        misdirection: c.content?.isMisdirection === true,
      };
      map.set(truthId, [...(map.get(truthId) ?? []), clue]);
    }
    return map;
  }, [clueQuery.data]);

  const loading = isLoading || truths.isLoading || clueQuery.isLoading;
  const failure = error ?? truths.error ?? clueQuery.error;
  if (loading || failure || gaps.length === 0) {
    return <ViewStatus isLoading={loading} error={failure} empty="還沒有公平性稽核的結果。" />;
  }

  // 只畫正文章（role=body）；格寬固定，線索多時在格內換行。
  const columns = (chapters.data ?? []).filter((c) => c.role === 'body').map((c) => c.number);
  const chapterTitle = new Map((chapters.data ?? []).map((c) => [c.number, c.title]));
  const clueSummary = (truthId: string, id: string) => (cluesByTruth.get(truthId) ?? []).find((c) => c.id === id)?.summary ?? id.slice(0, 8);
  const select = (gap: Gap) => {
    setSelectedId(gap.evidenceId);
    onSelectEvidence?.(gap.evidenceId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ overflowX: 'auto' }}>
          <div
            role="table"
            aria-label="真相 × 章節的線索與揭曉"
            style={{ display: 'grid', gridTemplateColumns: `minmax(180px, 16em) repeat(${columns.length}, 48px)`, gap: 'var(--space-1)', minWidth: 'max-content' }}
          >
            <div role="row" style={{ display: 'contents' }}>
              <span role="columnheader" style={{ ...headStyle, textAlign: 'left' }}>
                真相 ＼ 章
              </span>
              {columns.map((ch) => (
                <span key={ch} role="columnheader" style={headStyle} title={chapterTitle.get(ch) ?? undefined}>
                  {ch}
                </span>
              ))}
            </div>
            {gaps.map((gap) => {
              const clues = cluesByTruth.get(gap.truthId) ?? [];
              const isSel = gap.evidenceId === selectedId;
              const text = statement.get(gap.truthId) ?? '（找不到真相）';
              return (
                <div key={gap.evidenceId} role="row" style={{ display: 'contents' }}>
                  <button
                    type="button"
                    role="rowheader"
                    aria-pressed={isSel}
                    onClick={() => select(gap)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-1) var(--space-2)',
                      borderRadius: 'var(--radius-sm)',
                      outline: isSel ? 'var(--focus-ring-width) solid var(--focus-ring-color)' : undefined,
                    }}
                  >
                    <span className={VERDICTS[gap.verdict].className} style={{ flexShrink: 0 }}>
                      {VERDICTS[gap.verdict].label}
                    </span>
                    <span title={text} style={{ fontSize: 'var(--font-size-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {text}
                    </span>
                  </button>
                  {columns.map((ch) => {
                    const here = clues.filter((c) => c.chapter === ch);
                    const isReveal = gap.revealChapter === ch;
                    return (
                      <span
                        key={ch}
                        role="cell"
                        aria-label={`第 ${ch} 章：${here.length} 條線索${isReveal ? '，揭曉' : ''}`}
                        style={{
                          minHeight: 32,
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 3,
                          padding: 2,
                          borderRadius: 'var(--radius-sm)',
                          background: gap.revealChapter !== null && ch < gap.revealChapter ? 'var(--bg-secondary)' : undefined,
                          border: isReveal ? 'var(--border-width) solid var(--accent)' : 'var(--border-width) var(--border-style) transparent',
                        }}
                      >
                        {here.map((c) => (
                          <ClueMark key={c.id} clue={c} afterReveal={gap.revealChapter !== null && ch >= gap.revealChapter} />
                        ))}
                        {isReveal && <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--accent)', fontWeight: 600 }}>揭</span>}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <Legend />
      </div>

      {/* 逐項判定卡（畫布 Detail.dc.html）：每個真相一張；點矩陣的列或卡片會選中並加框。 */}
      <section aria-label="判定" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-5)' }}>
        {gaps.map((gap) => {
          const isSel = gap.evidenceId === selectedId;
          return (
            <article
              key={gap.evidenceId}
              aria-current={isSel || undefined}
              onClick={() => select(gap)}
              style={{
                cursor: 'pointer',
                background: 'var(--bg-primary)',
                border: isSel ? '2px var(--border-style) var(--accent)' : 'var(--card-border-width) var(--border-style) var(--border)',
                borderRadius: 'var(--card-radius)',
                boxShadow: 'var(--card-shadow)',
                padding: 'var(--space-5) var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{statement.get(gap.truthId) ?? '（找不到真相）'}</span>
                <span className={VERDICTS[gap.verdict].className} style={{ flexShrink: 0 }}>
                  {VERDICTS[gap.verdict].label}
                </span>
              </div>
              <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                揭曉前 {gap.before.length} 條線索 · 讀者可見 {gap.visible} · 誤導 {gap.misdirection} ·{' '}
                {gap.revealChapter !== null ? `揭曉於第 ${gap.revealChapter} 章` : '揭曉章不明'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>
                {gap.violations.map((v) => (
                  <div key={`${v.ruleSet}-${v.ruleNo}`} style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <span style={{ flexShrink: 0, color: 'var(--fg-secondary)' }}>可能違反</span>
                    <span>
                      {RULE_SET[v.ruleSet] ?? v.ruleSet} 第 {v.ruleNo} 條：{v.explanation}
                    </span>
                  </div>
                ))}
                {gap.gapDescription && <span>{gap.gapDescription}</span>}
              </div>
              {gap.before.length > 0 && (
                <details onClick={(e) => e.stopPropagation()}>
                  <summary style={{ ...small, cursor: 'pointer' }}>揭曉前的線索 · {gap.before.length}</summary>
                  <ul style={{ ...small, paddingLeft: 'var(--space-5)' }}>
                    {gap.before.map((id) => (
                      <li key={id}>{clueSummary(gap.truthId, id)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function Legend() {
  const sample = (visible: boolean, misdirection: boolean): Clue => ({ id: '', chapter: null, summary: '', visible, misdirection });
  const item: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-1)' };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>
      <span style={item}>
        <ClueMark clue={sample(true, false)} afterReveal={false} />
        讀者看得到的線索
      </span>
      <span style={item}>
        <ClueMark clue={sample(false, false)} afterReveal={false} />
        讀者看不到
      </span>
      <span style={item}>
        <ClueMark clue={sample(true, true)} afterReveal={false} />
        誤導
      </span>
      <span style={item}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>揭</span>
        揭曉章（底色＝揭曉前；揭曉後的線索淡化）
      </span>
    </div>
  );
}
