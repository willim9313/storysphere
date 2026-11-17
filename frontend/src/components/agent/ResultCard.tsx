import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useConfirmDraft, useDiscardDraft, useSaveMethodology, type NoteDraft } from '@/api/agent';
import type { MethodSummary } from '@/api/registry';
import { useViewData } from '@/api/runs';
import { Prose } from '@/components/Prose';
import { ViewRenderer } from '@/components/views/ViewRenderer';
import { callKey, methodSteps, resultState, resultTitle, reusedResults, strayIds, turnTime, type Turn } from './turns';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };
// 設計稿的區塊小標：2xs、粗、字距、muted。
const eyebrow: CSSProperties = { fontSize: 'var(--font-size-2xs)', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--fg-muted)' };
const field: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--font-size-sm)',
  lineHeight: 1.7,
  padding: 'var(--space-4) var(--space-5)',
  border: 'var(--input-border-width) solid var(--border)',
  borderRadius: 'var(--input-radius)',
  background: 'var(--input-bg)',
  color: 'var(--fg-primary)',
};
const cardBase: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  display: 'flex',
  flexDirection: 'column',
};

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

const STATE_BADGE = {
  unsaved: { text: '未儲存', className: 'ss-badge ss-badge-warning' },
  saved: { text: '已存成筆記', className: 'ss-badge ss-badge-success' },
  discarded: { text: '已捨棄', className: 'ss-badge ss-badge-neutral' },
} as const;

/** 引用的證據：用 N-04e（evidence_list）一次取回類型、層級、摘要（設計稿：類型 mono、層級、摘要 serif）。 */
function CitedList({ bookId, ids, onRemove }: Readonly<{ bookId: string; ids: string[]; onRemove?: (id: string) => void }>) {
  const { data } = useViewData(bookId, 'evidence_list', { evidenceIds: ids });
  const byId = new Map((data?.primary ?? []).map((e) => [e.id, e]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 280, overflowY: 'auto' }}>
      {ids.map((id) => {
        const item = byId.get(id);
        return (
          <div
            key={id}
            style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', padding: 'var(--space-2) 0', borderTop: 'var(--border-width) var(--border-style) var(--border)', fontSize: 'var(--font-size-2xs)' }}
          >
            <span style={{ ...mono, color: 'var(--fg-secondary)', flexShrink: 0 }}>{item?.claimType ?? id.slice(0, 8)}</span>
            <span style={{ color: item?.level === 1 ? 'var(--color-error)' : 'var(--fg-muted)', flexShrink: 0 }}>{item ? `L${item.level}` : ''}</span>
            <span style={{ flex: 1, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-primary)', minWidth: 0 }}>{item?.summary ?? '…'}</span>
            {onRemove && (
              <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => onRemove(id)} aria-label={`移除引用 ${id}`}>
                移除
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 已存、已捨棄的結果收合成一行（設計稿「結果 C」）。 */
function CollapsedResult({ bookId, turn, code, origin, onExpand }: Readonly<{ bookId: string; turn: Turn; code: string; origin: string; onExpand: () => void }>) {
  const state = resultState(turn);
  const badge = STATE_BADGE[state];
  const noteId = turn.drafts.find((d) => d.state === 'confirmed')?.noteId;
  return (
    <article
      id={`result-${turn.turnId}`}
      aria-label={`結果 ${code}，${badge.text}`}
      style={{ background: 'var(--bg-secondary)', border: 'var(--card-border-width) var(--border-style) var(--border)', borderRadius: 'var(--card-radius)', padding: 'var(--space-4) var(--space-6)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)' }}
    >
      <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" aria-label={`展開結果 ${code}`} onClick={onExpand}>
        ›
      </button>
      <span style={{ ...mono, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>結果 {code}</span>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-base)', fontWeight: 600, minWidth: 0 }}>{resultTitle(turn)}</span>
      <span className={badge.className}>{badge.text}</span>
      <span style={small}>{[origin, turnTime(turn)].filter(Boolean).join(' · ')}</span>
      {noteId && (
        <Link to={`/books/${bookId}/notes?note=${noteId}`} style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)' }}>
          在筆記中開啟
        </Link>
      )}
    </article>
  );
}

/** 「本次分析結果」的一個結果（05 §3.3、畫布 Agent.dc.html）：標頭三個動作、左 view 右結論與引用、底部怎麼得出的。 */
export function ResultCard({
  bookId,
  sessionId,
  turn,
  label: code,
  methods,
  readOnly,
  highlight,
}: Readonly<{ bookId: string; sessionId: string; turn: Turn; label: string; methods: Map<string, MethodSummary>; readOnly: boolean; highlight: boolean }>) {
  const state = resultState(turn);
  const badge = STATE_BADGE[state];
  // 一輪通常只有一份草稿；有多份時以還開著的為準。
  const draft: NoteDraft | undefined = turn.drafts.find((d) => d.state === 'open') ?? turn.drafts.find((d) => d.state === 'confirmed') ?? turn.drafts[0];
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(draft?.title ?? '');
  const [conclusion, setConclusion] = useState(draft?.conclusion ?? '');
  const [cited, setCited] = useState(draft?.citedEvidenceIds ?? []);
  const [editing, setEditing] = useState(false);
  const confirm = useConfirmDraft(bookId, sessionId);
  const discard = useDiscardDraft(sessionId);
  const saveMethodology = useSaveMethodology();

  const reused = reusedResults(turn).map((r) => (r.methodId ? methods.get(r.methodId)?.code ?? r.methodId : `run ${r.runId?.slice(0, 6)}`));
  const ran = methodSteps(turn).map((id) => methods.get(id)?.code ?? id);
  const origin = [
    ran.length > 0 ? `臨時組合：${[...new Set(ran)].join(' ＋ ')}` : null,
    reused.length > 0 ? `取用結果卡 ${[...new Set(reused)].join(' ＋ ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (state !== 'unsaved' && !expanded) {
    return <CollapsedResult bookId={bookId} turn={turn} code={code} origin={origin} onExpand={() => setExpanded(true)} />;
  }

  const open = draft?.state === 'open' && !readOnly;
  const problems = (draft?.check.problems as { code: string; message: string; evidenceId?: string }[] | undefined) ?? [];
  // 使用者移除的引用，它的問題也跟著消失；一筆都不剩時就是 no_citation（後端會再擋一次）。
  const remaining = problems.filter((p) => p.code !== 'no_citation' && (!p.evidenceId || cited.includes(p.evidenceId)));
  if (draft && cited.length === 0) remaining.push({ code: 'no_citation', message: '至少要引用一筆證據。' });
  const stray = draft ? strayIds(conclusion, cited) : [];
  const steps = methodSteps(turn);
  const methodologyReason =
    readOnly || steps.length > 0 ? null : '這一輪沒有執行任何方法（run_method），只取用了現成結果，沒有可存的方法論步驟。';

  const save = () => {
    if (!draft) return;
    confirm.mutate({
      draftId: draft.draftId,
      title: title.trim() !== draft.title ? title.trim() : undefined,
      conclusion: conclusion !== draft.conclusion ? conclusion : undefined,
      citedEvidenceIds: cited.length !== draft.citedEvidenceIds.length ? cited : undefined,
    });
  };

  const chain = turn.calls.filter((c) => c.status === 'ok');
  const errors = [confirm.error, discard.error, saveMethodology.error].filter(Boolean);

  return (
    <article
      id={`result-${turn.turnId}`}
      aria-label={`結果 ${code}`}
      style={{ ...cardBase, border: highlight ? '2px var(--border-style) var(--accent)' : cardBase.border }}
    >
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', padding: 'var(--space-5) var(--space-6)', borderBottom: 'var(--border-width) var(--border-style) var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
            <span style={{ ...mono, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>結果 {code}</span>
            <span className={badge.className}>{badge.text}</span>
            {draft && <span className="ss-badge ss-badge-neutral">L3</span>}
            {origin && <span className="ss-badge ss-badge-neutral">{origin}</span>}
          </div>
          {editing ? (
            <input aria-label="標題" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...field, fontSize: 'var(--font-size-lg)', fontWeight: 700 }} />
          ) : (
            <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>{draft ? title : turn.question}</h3>
          )}
          <span style={small}>{[`問句：${turn.question}`, turnTime(turn)].filter(Boolean).join(' · ')}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
          {open && (
            <button type="button" className="ss-btn ss-btn-sm ss-btn-primary" disabled={remaining.length > 0 || !title.trim() || confirm.isPending} onClick={save}>
              存成筆記
            </button>
          )}
          {!readOnly && !saveMethodology.data && (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary"
              disabled={steps.length === 0 || saveMethodology.isPending}
              title={methodologyReason ?? undefined}
              onClick={() => saveMethodology.mutate({ question: turn.question, sessionId, turnId: turn.turnId })}
            >
              另存方法論
            </button>
          )}
          {open && draft && (
            <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" disabled={discard.isPending} onClick={() => discard.mutate(draft.draftId)}>
              捨棄
            </button>
          )}
          {state === 'saved' && draft?.noteId && (
            <Link to={`/books/${bookId}/notes?note=${draft.noteId}`} style={{ fontSize: 'var(--font-size-xs)' }}>
              在筆記中開啟
            </Link>
          )}
          {state !== 'unsaved' && (
            <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setExpanded(false)}>
              收合
            </button>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', padding: 'var(--space-5) var(--space-6)' }}>
        {turn.views.length > 0 && (
          <div style={{ flex: '3 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {turn.views.map((view) => (
              <ViewRenderer key={view.seq} viewType={view.viewType} bookId={bookId} runId={view.runId} evidenceIds={view.evidenceIds} />
            ))}
          </div>
        )}
        <div style={{ flex: '2 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {draft ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                  <span style={eyebrow}>結論{open ? '（存成筆記前可改）' : ''}</span>
                  {open && (
                    <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setEditing(!editing)}>
                      {editing ? '完成' : '修改'}
                    </button>
                  )}
                </div>
                {editing ? (
                  <textarea aria-label="結論" rows={10} value={conclusion} onChange={(e) => setConclusion(e.target.value)} style={{ ...field, resize: 'vertical' }} />
                ) : (
                  <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                    <Prose>{conclusion}</Prose>
                  </div>
                )}
                {stray.length > 0 && (
                  <p style={{ ...small, color: 'var(--color-warning)' }}>
                    結論裡有 {stray.length} 個 id 不在引用清單中（可能是大腦抄錯）：<span style={mono}> {stray.join('、')}</span>。存之前可以修改結論。
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <span style={eyebrow}>引用的證據 · {cited.length}</span>
                <CitedList bookId={bookId} ids={cited} onRemove={open ? (id) => setCited(cited.filter((c) => c !== id)) : undefined} />
              </div>
              {open && remaining.length > 0 && (
                <ul style={{ ...small, color: 'var(--color-error)', paddingLeft: 'var(--space-5)' }}>
                  {remaining.map((p, i) => (
                    <li key={`${p.code}-${p.evidenceId ?? i}`}>{p.message}</li>
                  ))}
                </ul>
              )}
              {open && <span style={small}>按下「存成筆記」＝人工審核；引用的證據都要是第 2 層以上。</span>}
            </>
          ) : (
            <p style={small}>這一輪大腦沒有寫筆記草稿，所以不能直接存成筆記；可以請它「整理成筆記」。</p>
          )}
          {errors.map((e, i) => (
            <p key={i} role="alert" style={{ ...small, color: 'var(--color-error)' }}>
              {errorText(e)}
            </p>
          ))}
          {saveMethodology.data && (
            <p style={small}>
              已另存方法論 <span style={mono}>{saveMethodology.data.id}</span>（{saveMethodology.data.steps.map((s) => s.method).join(' → ')}）；原型沒有方法論執行器，可在
              <Link to="/registry">方法目錄</Link>查看。
            </p>
          )}
        </div>
      </div>

      <footer
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-3) var(--space-4)',
          alignItems: 'center',
          padding: 'var(--space-4) var(--space-6)',
          background: 'var(--bg-secondary)',
          borderTop: 'var(--border-width) var(--border-style) var(--border)',
          borderRadius: '0 0 var(--card-radius) var(--card-radius)',
          fontSize: 'var(--font-size-2xs)',
          color: 'var(--fg-secondary)',
        }}
      >
        <span style={{ fontWeight: 600 }}>怎麼得出的</span>
        {chain.length === 0 && <span>（沒有工具呼叫）</span>}
        {chain.map((c, i) => (
          <span key={c.seq} style={{ display: 'inline-flex', gap: 'var(--space-4)' }}>
            {i > 0 && <span aria-hidden="true">→</span>}
            <span style={mono}>{[c.tool, callKey(c)].filter(Boolean).join(' ')}</span>
          </span>
        ))}
        {methodologyReason && !readOnly && <span style={{ ...small, flexBasis: '100%' }}>另存方法論停用：{methodologyReason}</span>}
      </footer>
    </article>
  );
}
