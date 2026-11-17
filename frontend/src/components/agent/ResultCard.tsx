import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { ApiError } from '@/api/client';
import { useConfirmDraft, useDiscardDraft, useSaveMethodology, type NoteDraft } from '@/api/agent';
import type { MethodSummary } from '@/api/registry';
import { useViewData } from '@/api/runs';
import { ViewRenderer } from '@/components/views/ViewRenderer';
import { methodSteps, resultState, reusedResults, strayIds, type Turn } from './turns';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };
const label: CSSProperties = { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--fg-secondary)' };
const field: CSSProperties = {
  font: 'inherit',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--fg-primary)',
  background: 'var(--bg-primary)',
  border: 'var(--border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
};
const card: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  padding: 'var(--space-5) var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

const STATE_BADGE = {
  unsaved: { text: '未儲存', className: 'ss-badge ss-badge-warning' },
  saved: { text: '已存成筆記', className: 'ss-badge ss-badge-success' },
  discarded: { text: '已捨棄', className: 'ss-badge ss-badge-neutral' },
} as const;

/** 草稿引用的證據：用 N-04e（evidence_list）一次取回類型、層級、摘要。 */
function CitedList({
  bookId,
  ids,
  onRemove,
}: Readonly<{ bookId: string; ids: string[]; onRemove?: (id: string) => void }>) {
  const { data } = useViewData(bookId, 'evidence_list', { evidenceIds: ids });
  const byId = new Map((data?.primary ?? []).map((e) => [e.id, e]));
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 240, overflowY: 'auto' }}>
      {ids.map((id) => {
        const item = byId.get(id);
        return (
          <li key={id} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', fontSize: 'var(--font-size-xs)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
              {item ? `${item.claimType} · L${item.level}` : id.slice(0, 8)}
            </span>
            <span style={{ flex: 1, minWidth: 0, color: item?.level === 1 ? 'var(--color-error)' : 'var(--fg-primary)' }}>
              {item?.summary ?? '…'}
            </span>
            {onRemove && (
              <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => onRemove(id)} aria-label={`移除引用 ${id}`}>
                移除
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 一份草稿：可改的標題、結論、引用；存成筆記（N-06c draft）與捨棄（N-10k）。 */
function DraftEditor({ bookId, sessionId, draft, readOnly }: Readonly<{ bookId: string; sessionId: string; draft: NoteDraft; readOnly: boolean }>) {
  const confirm = useConfirmDraft(bookId, sessionId);
  const discard = useDiscardDraft(sessionId);
  const [title, setTitle] = useState(draft.title);
  const [conclusion, setConclusion] = useState(draft.conclusion);
  const [cited, setCited] = useState(draft.citedEvidenceIds);
  const [editing, setEditing] = useState(false);

  const open = draft.state === 'open' && !readOnly;
  const problems = (draft.check.problems as { code: string; message: string; evidenceId?: string }[] | undefined) ?? [];
  // 使用者移除的引用，它的問題也跟著消失；一筆都不剩時就是 no_citation（後端會再擋一次）。
  const remaining = problems.filter((p) => p.code !== 'no_citation' && (!p.evidenceId || cited.includes(p.evidenceId)));
  if (cited.length === 0) remaining.push({ code: 'no_citation', message: '至少要引用一筆證據。' });
  const stray = strayIds(conclusion, cited);

  const save = () => {
    const changed = {
      title: title.trim() !== draft.title ? title.trim() : undefined,
      conclusion: conclusion !== draft.conclusion ? conclusion : undefined,
      citedEvidenceIds: cited.length !== draft.citedEvidenceIds.length ? cited : undefined,
    };
    confirm.mutate({ draftId: draft.draftId, ...changed });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={label}>結論{open ? '（存成筆記前可改）' : ''}</span>
        {open && (
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setEditing(!editing)}>
            {editing ? '完成' : '修改'}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <input aria-label="標題" value={title} onChange={(e) => setTitle(e.target.value)} style={field} />
          <textarea aria-label="結論" rows={8} value={conclusion} onChange={(e) => setConclusion(e.target.value)} style={field} />
        </>
      ) : (
        <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.7, maxHeight: 360, overflowY: 'auto' }}>
          <Markdown>{conclusion}</Markdown>
        </div>
      )}
      {stray.length > 0 && (
        <p style={{ ...small, color: 'var(--color-warning)' }}>
          結論裡有 {stray.length} 個 id 不在引用清單中（可能是大腦抄錯）：
          <span style={{ fontFamily: 'var(--font-mono)' }}> {stray.join('、')}</span>。存之前可以修改結論。
        </p>
      )}

      <span style={label}>引用的證據 · {cited.length}</span>
      <CitedList bookId={bookId} ids={cited} onRemove={open ? (id) => setCited(cited.filter((c) => c !== id)) : undefined} />

      {open && remaining.length > 0 && (
        <ul style={{ ...small, color: 'var(--color-error)', paddingLeft: 'var(--space-5)' }}>
          {remaining.map((p, i) => (
            <li key={`${p.code}-${p.evidenceId ?? i}`}>{p.message}</li>
          ))}
        </ul>
      )}
      {confirm.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(confirm.error)}</p>}
      {discard.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(discard.error)}</p>}
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <button
            type="button"
            className="ss-btn ss-btn-md ss-btn-primary"
            disabled={remaining.length > 0 || !title.trim() || confirm.isPending}
            onClick={save}
          >
            存成筆記
          </button>
          <button type="button" className="ss-btn ss-btn-md ss-btn-ghost" disabled={discard.isPending} onClick={() => discard.mutate(draft.draftId)}>
            捨棄
          </button>
        </div>
      )}
      {open && <span style={small}>按下「存成筆記」＝人工審核；引用的證據都要是第 2 層以上。</span>}
    </div>
  );
}

/** 另存方法論（N-07e）：原型只取這一輪的 run_method，沒有就停用並說明。 */
function SaveMethodology({ sessionId, turn, readOnly }: Readonly<{ sessionId: string; turn: Turn; readOnly: boolean }>) {
  const save = useSaveMethodology();
  const steps = methodSteps(turn);
  const disabledReason = readOnly
    ? null
    : steps.length === 0
      ? '這一輪沒有執行任何方法（run_method），只取用了現成結果，沒有可存的步驟。'
      : null;
  if (save.data) {
    return (
      <p style={small}>
        已另存方法論 <span style={{ fontFamily: 'var(--font-mono)' }}>{save.data.id}</span>（{save.data.steps.map((s) => s.method).join(' → ')}）；
        原型沒有方法論執行器，可在<Link to="/registry">方法目錄</Link>查看。
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
      <button
        type="button"
        className="ss-btn ss-btn-sm ss-btn-secondary"
        disabled={readOnly || steps.length === 0 || save.isPending}
        title={disabledReason ?? undefined}
        onClick={() => save.mutate({ question: turn.question, sessionId, turnId: turn.turnId })}
      >
        另存方法論
      </button>
      {disabledReason && <span style={small}>{disabledReason}</span>}
      {steps.length > 0 && !disabledReason && <span style={small}>步驟：{steps.join(' → ')}</span>}
      {save.error && <span role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(save.error)}</span>}
    </div>
  );
}

/** 右側「本次分析結果」的一個結果（05 §3.3）：view、草稿、怎麼得出的、三個動作。 */
export function ResultCard({
  bookId,
  sessionId,
  turn,
  label: code,
  methods,
  readOnly,
}: Readonly<{ bookId: string; sessionId: string; turn: Turn; label: string; methods: Map<string, MethodSummary>; readOnly: boolean }>) {
  const state = resultState(turn);
  const badge = STATE_BADGE[state];
  const draft = turn.drafts.find((d) => d.state === 'confirmed') ?? turn.drafts.find((d) => d.state === 'open') ?? turn.drafts[0];
  const title = draft?.title ?? turn.question;
  const [expanded, setExpanded] = useState(false);

  const reused = reusedResults(turn).map((r) => (r.methodId ? methods.get(r.methodId)?.code ?? r.methodId : `run ${r.runId?.slice(0, 6)}`));
  const ran = methodSteps(turn).map((id) => methods.get(id)?.code ?? id);
  const origin = [
    ran.length > 0 ? `執行 ${[...new Set(ran)].join('＋')}` : null,
    reused.length > 0 ? `取用結果卡 ${[...new Set(reused)].join('＋')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (state !== 'unsaved' && !expanded) {
    return (
      <div id={`result-${turn.turnId}`} style={{ ...card, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', padding: 'var(--space-3) var(--space-5)' }}>
        <span style={{ fontWeight: 600 }}>結果 {code}</span>
        <span className={badge.className}>{badge.text}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-sm)' }}>{title}</span>
        {state === 'saved' && draft?.noteId && (
          <Link to={`/books/${bookId}/notes?note=${draft.noteId}`} style={{ fontSize: 'var(--font-size-xs)' }}>
            在筆記中開啟
          </Link>
        )}
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setExpanded(true)}>
          展開
        </button>
      </div>
    );
  }

  return (
    <article id={`result-${turn.turnId}`} style={card} aria-label={`結果 ${code}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ fontWeight: 600 }}>結果 {code}</span>
        <span className={badge.className}>{badge.text}</span>
        {origin && <span style={small}>{origin}</span>}
        {state !== 'unsaved' && (
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setExpanded(false)}>
            收合
          </button>
        )}
      </div>
      <div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>{title}</h3>
        <p style={small}>問句：{turn.question}</p>
      </div>

      {turn.views.map((view) => (
        <ViewRenderer key={view.seq} viewType={view.viewType} bookId={bookId} runId={view.runId} evidenceIds={view.evidenceIds} />
      ))}

      {turn.drafts.length === 0 && (
        <p style={small}>這一輪大腦沒有寫筆記草稿，所以不能直接存成筆記；可以請它「整理成筆記」。</p>
      )}
      {turn.drafts.map((d) => (
        <DraftEditor key={d.draftId} bookId={bookId} sessionId={sessionId} draft={d} readOnly={readOnly} />
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderTop: 'var(--border-width) var(--border-style) var(--border)', paddingTop: 'var(--space-3)' }}>
        <span style={label}>怎麼得出的</span>
        <span style={{ ...small, fontFamily: 'var(--font-mono)' }}>
          {turn.calls.filter((c) => c.status === 'ok').map((c) => c.tool).join(' → ') || '（沒有工具呼叫）'}
        </span>
        <SaveMethodology sessionId={sessionId} turn={turn} readOnly={readOnly} />
      </div>
    </article>
  );
}
