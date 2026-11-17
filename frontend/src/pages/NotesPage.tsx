import { useState, type CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAddInterpretation, useNote, useNotes, useRerunNote } from '@/api/notes';
import { BookNav } from '@/components/layout/BookNav';
import { Prose } from '@/components/Prose';
import { PageHeader, PageMain } from '@/components/layout/PageMain';
import { claimTypeLabel } from '@/components/views/labels';

const panel: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
};
const h3: CSSProperties = { margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-base)', fontWeight: 600 };
const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };

function when(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

interface TraceRun {
  runId: string;
  refId: string;
  promptVersion?: string | null;
  model?: string | null;
}

/** 打開的一篇筆記：結論、引用證據、產生它的方法論 trace、詮釋（05 §3 畫面 6）。 */
function NoteView({ bookId, noteId }: Readonly<{ bookId: string; noteId: string }>) {
  const { data: note, error } = useNote(bookId, noteId);
  const rerun = useRerunNote(bookId);
  const addInterp = useAddInterpretation(bookId);
  const [text, setText] = useState('');

  if (error) return <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>讀不到筆記：{errorText(error)}</p>;
  if (!note) return <p style={small}>讀取中…</p>;
  const content = note.content as {
    title: string;
    conclusion: string;
    question?: string | null;
    methodologyTrace?: { kind?: string; runs?: TraceRun[] };
  };
  const trace = content.methodologyTrace ?? {};
  const source = note.producedVia === 'agent' ? `agent · ${note.agentBackend ?? ''}` : '結果卡';

  return (
    <article aria-labelledby="note-h" style={{ ...panel, flex: '3 1 560px', minWidth: 0, padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 id="note-h" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>
            {content.title}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="ss-badge ss-badge-neutral">L{note.level}</span>
            <span className="ss-badge ss-badge-success">{note.reviewStatus === 'modified' ? '已修改後確認' : '已確認'}</span>
            {note.basisChanged && <span className="ss-badge ss-badge-warning">依據已變動</span>}
            <span className="ss-badge ss-badge-neutral">來源：{source}</span>
            {content.question && <span style={small}>問句：{content.question}</span>}
          </div>
        </div>
        <div>
          {trace.kind === 'ui_run' && (
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
              disabled={rerun.isPending}
              onClick={() => rerun.mutate(noteId)}
            >
              重跑
            </button>
          )}
        </div>
      </header>
      {rerun.data && <p style={small}>已排入重跑（{rerun.data.status}）；新結果會出現在結果卡，這篇筆記不變。</p>}
      {rerun.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(rerun.error)}</p>}

      <Prose className="ss-prose-lg">{content.conclusion}</Prose>

      <section aria-labelledby="cite-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h3 id="cite-h" style={h3}>
          引用的證據 · {note.cited.length}
        </h3>
        {note.cited.map((item) => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '120px 40px minmax(0, 1fr) auto', gap: 'var(--space-4)', alignItems: 'baseline', padding: 'var(--space-2) 0', borderTop: 'var(--border-width) var(--border-style) var(--border)' }}>
            <span style={{ ...small, fontFamily: 'var(--font-mono)' }}>{claimTypeLabel(item.claimType)}</span>
            <span style={small}>L{item.level}</span>
            <span style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
              {item.summary}
              {item.status !== 'current' && <span className="ss-badge ss-badge-warning" style={{ marginLeft: 'var(--space-2)' }}>{item.status === 'rejected' ? '已拒絕' : '已被取代'}</span>}
            </span>
            {item.runId ? (
              <Link to={`/books/${bookId}/runs/${item.runId}`} style={{ fontSize: 'var(--font-size-2xs)' }}>
                追溯
              </Link>
            ) : (
              <span />
            )}
          </div>
        ))}
      </section>

      {trace.kind === 'ui_run' && trace.runs && (
        <section aria-labelledby="trace-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h3 id="trace-h" style={h3}>
            產生它的分析
          </h3>
          <div className="ss-steps">
            {trace.runs.map((run, index) => (
              <div key={run.runId} className="ss-step done">
                <div className="ss-step-rail">
                  <div className="ss-step-marker">{index + 1}</div>
                  <div className="ss-step-line" />
                </div>
                <div className="ss-step-body">
                  <div className="ss-step-title">{run.refId}</div>
                  <div className="ss-step-desc">
                    {[`run ${run.runId.slice(0, 6)}`, run.model, run.promptVersion ? `prompt ${run.promptVersion}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="int-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h3 id="int-h" style={h3}>
          詮釋 · {note.interpretations.length}
        </h3>
        {note.interpretations.map((item) => (
          <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: 'var(--space-3) var(--space-4)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)' }}>「{item.summary}」</span>
            <span style={small}>
              來源：{item.source === 'agent' ? 'agent（使用者允許後寫入）' : '你'} · 不會被當成文本事實
            </span>
          </div>
        ))}
        <label htmlFor="interp" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
          加上你的詮釋
        </label>
        <textarea
          id="interp"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          style={{ font: 'inherit', fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)', background: 'var(--bg-primary)', border: 'var(--border-width) var(--border-style) var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}
        />
        {addInterp.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(addInterp.error)}</p>}
        <div>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary"
            disabled={!text.trim() || addInterp.isPending}
            onClick={() => addInterp.mutate({ text: text.trim(), citedEvidenceIds: [noteId] }, { onSuccess: () => setText('') })}
          >
            加詮釋
          </button>
        </div>
      </section>
    </article>
  );
}

/** 畫面 6 筆記（畫布 `Notes.dc.html`）。 */
export function NotesPage() {
  const { bookId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, error, isLoading } = useNotes(bookId);
  const notes = data?.items ?? [];
  const openId = params.get('note') ?? notes[0]?.id ?? null;
  const changed = notes.filter((n) => n.basisChanged).length;

  return (
    <>
      <BookNav view="筆記" />
      <PageMain>
        <PageHeader title="筆記" meta={data ? `${data.total} 篇 · 都經過人工確認${changed ? ` · ${changed} 篇依據已變動` : ''}` : undefined} />
        {isLoading && <p style={small}>讀取中…</p>}
        {error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>讀不到筆記：{errorText(error)}</p>}
        {data && notes.length === 0 && (
          <p style={{ ...small, fontSize: 'var(--font-size-sm)' }}>
            還沒有筆記。在結果卡詳情按「存成筆記」，或在 Agent 工作區確認大腦的草稿。
          </p>
        )}
        {notes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
            <section aria-label="筆記列表" style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {notes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  aria-current={note.id === openId}
                  onClick={() => setParams({ note: note.id })}
                  style={{
                    ...panel,
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                    padding: 'var(--space-4) var(--space-5)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    borderColor: note.id === openId ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <span style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    {note.title}
                    {note.basisChanged && <span className="ss-badge ss-badge-warning">依據已變動</span>}
                  </span>
                  <span style={small}>
                    L{note.level} · {note.producedVia === 'agent' ? `Agent（${note.agentBackend ?? ''}）` : '結果卡'} · {when(note.createdAt)}
                  </span>
                </button>
              ))}
              <p style={small}>筆記不會被之後的重跑取代；它引用的證據被拒絕或重新抽取時，只會標「依據已變動」。</p>
            </section>
            {openId && <NoteView key={openId} bookId={bookId} noteId={openId} />}
          </div>
        )}
      </PageMain>
    </>
  );
}
