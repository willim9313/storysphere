import { useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/api/client';
import { useEvidence, useRunEvidence, type EvidenceItem } from '@/api/evidence';
import { useMethods } from '@/api/registry';
import { useCards, useRerun, useRun } from '@/api/runs';
import { EvidenceCard, type SourceRef } from '@/components/detail/EvidenceCard';
import { SaveNote } from '@/components/detail/SaveNote';
import { SourcePanel } from '@/components/detail/SourcePanel';
import { BookNav } from '@/components/layout/BookNav';
import { PageMain } from '@/components/layout/PageMain';
import { viewTitle } from '@/components/views/labels';
import { ViewRenderer } from '@/components/views/ViewRenderer';

const GRADE: Record<string, string> = { theory: '理論', technique: '技法', derived: '衍生' };
const FILTERS = [
  { id: 'all', label: '全部', test: () => true },
  { id: 'pending', label: '待審', test: (e: EvidenceItem) => e.reviewStatus === 'pending' && e.status !== 'rejected' },
  { id: 'approved', label: '已確認', test: (e: EvidenceItem) => e.reviewStatus === 'approved' || e.reviewStatus === 'modified' },
] as const;

const panel: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  padding: 'var(--space-5) var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};
const h2: CSSProperties = { margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', fontWeight: 600 };
const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 在 view 裡點到、但不在這個 run 產出裡的證據（例如別的角色的 CH5），另外顯示在右欄最上面。 */
function SelectedEvidence({ bookId, evidenceId, onOpenSource }: Readonly<{ bookId: string; evidenceId: string; onOpenSource: (ref: SourceRef) => void }>) {
  const { data } = useEvidence(bookId, evidenceId);
  if (!data) return null;
  const item: EvidenceItem = { ...data, quoteCount: data.quotes.length, firstQuote: data.quotes[0]?.text.slice(0, 120) ?? null };
  return <EvidenceCard bookId={bookId} item={item} selected onOpenSource={onOpenSource} />;
}

/** 畫面 4 結果卡詳情（畫布 `Detail.dc.html`，05 §3.2）。 */
export function RunDetailPage() {
  const { bookId = '', runId = '' } = useParams();
  const { data: run, error } = useRun(bookId, runId);
  const { data: methods = [] } = useMethods();
  const { data: cards = [] } = useCards(bookId);
  const { data: evidence = [], isLoading: evidenceLoading } = useRunEvidence(bookId, runId);
  const rerun = useRerun(bookId);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [source, setSource] = useState<SourceRef | null>(null);
  const [saving, setSaving] = useState(false);

  const method = methods.find((m) => m.id === run?.refId);
  const card = cards.find((c) => c.refId === run?.refId);
  const viewType = card?.viewType ?? method?.view ?? null;
  const shown = evidence.filter(FILTERS.find((f) => f.id === filter)!.test);
  const selectedOutside = selected !== null && !evidence.some((e) => e.id === selected);

  const runMeta = run
    ? [
        `run ${run.id.slice(0, 6)}`,
        run.model,
        run.promptVersion ? `prompt ${run.promptVersion}` : null,
        run.version ? `registry v${run.version}` : null,
        run.finishedAt ? new Date(run.finishedAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : null,
        `輸入 ${run.inputEvidenceIds.length} 筆證據`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <>
      <BookNav view="結果卡詳情" />
      <PageMain>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Link to={`/books/${bookId}`} style={{ ...small, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' }}>
              <ArrowLeft size={12} aria-hidden="true" />
              回總覽
            </Link>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-3xl)', fontWeight: 700, lineHeight: 1.2 }}>
              {card?.question ?? run?.question ?? '…'}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{run?.code}</span>
              {run?.basis && (
                <>
                  <span>·</span>
                  <span>{run.basis}</span>
                </>
              )}
              {run?.grade && <span className="ss-badge ss-badge-neutral">{GRADE[run.grade] ?? run.grade}</span>}
              {method?.mechanism && <span className="ss-badge ss-badge-neutral">{method.mechanism}機制</span>}
              {run?.superseded && <span className="ss-badge ss-badge-warning">已有較新的結果</span>}
            </div>
            <span style={{ ...small, fontFamily: 'var(--font-mono)' }}>{runMeta}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <button
              type="button"
              className="ss-btn ss-btn-md ss-btn-secondary ss-btn-llm"
              disabled={!run || rerun.isPending}
              onClick={() => rerun.mutate(runId)}
            >
              重跑
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-md ss-btn-primary"
              disabled={!run || evidenceLoading || saving}
              onClick={() => {
                setSaving(true);
                document.getElementById('save-note')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              存成筆記
            </button>
          </div>
        </div>
        {method && method.question !== (card?.question ?? run?.question) && (
          <p style={{ margin: 0, padding: 'var(--space-4) var(--space-5)', background: 'var(--color-info-bg)', color: 'var(--fg-secondary)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>
            這張卡回答的是：{method.question}
            {method.basis ? `（依據 ${method.basis}）` : ''}
          </p>
        )}
        {rerun.data && <p style={small}>已排入重跑（{rerun.data.status}）；完成後總覽的結果卡會更新。</p>}
        {rerun.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(rerun.error)}</p>}
        {error && <p role="alert" style={{ margin: 0, color: 'var(--color-error)' }}>讀不到這個 run：{errorText(error)}</p>}

        {run && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
            <section aria-labelledby="view-h" style={{ ...panel, flex: '3 1 640px', minWidth: 0 }}>
              <h2 id="view-h" style={h2}>
                {viewTitle(viewType)}
              </h2>
              <ViewRenderer viewType={viewType} bookId={bookId} runId={runId} onSelectEvidence={setSelected} />
            </section>

            <div style={{ flex: '2 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <section aria-labelledby="ev-h" style={panel}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <h2 id="ev-h" style={h2}>
                    證據
                  </h2>
                  <nav className="ss-tabs" aria-label="篩選證據">
                    {FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`ss-tab${filter === f.id ? ' active' : ''}`}
                        aria-pressed={filter === f.id}
                        onClick={() => setFilter(f.id)}
                      >
                        {f.label} {evidence.filter(f.test).length}
                      </button>
                    ))}
                  </nav>
                </div>
                {selectedOutside && <SelectedEvidence bookId={bookId} evidenceId={selected} onOpenSource={setSource} />}
                {evidenceLoading && <p style={small}>讀取中…</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: 720, overflowY: 'auto' }}>
                  {shown.map((item) => (
                    <EvidenceCard key={item.id} bookId={bookId} item={item} selected={item.id === selected} onOpenSource={setSource} />
                  ))}
                  {!evidenceLoading && shown.length === 0 && <p style={small}>沒有符合的證據。</p>}
                </div>
              </section>
              {source && <SourcePanel bookId={bookId} source={source} onClose={() => setSource(null)} />}
            </div>
          </div>
        )}
        {run && !evidenceLoading && (
          <SaveNote bookId={bookId} runId={runId} question={card?.question ?? run.question ?? ''} evidence={evidence} open={saving} onOpenChange={setSaving} />
        )}
      </PageMain>
    </>
  );
}
