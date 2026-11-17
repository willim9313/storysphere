import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock } from 'lucide-react';
import { useBook } from '@/api/books';
import { ApiError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { useAskable, useCards, useGenre, useTriggerRun, type Card } from '@/api/runs';
import { BookNav } from '@/components/layout/BookNav';
import { PageHeader, PageMain } from '@/components/layout/PageMain';
import { genreLabel } from '@/components/library/labels';
import { useEventStream } from '@/hooks/useEventStream';

// registry/perspectives/mechanisms.yaml 的七個機制。
const MECHANISMS: Record<string, string> = {
  info_control: '資訊控制',
  world_rules: '世界規則',
  threat: '威脅與恐懼',
  relations: '關係演變',
  journey: '移動與越界',
  historicity: '史實對照',
  language_form: '語言與形式',
};

// 05 §3.1 卡片的六態＋原型的「尚未支援」（04 §2.4 `implemented=false`）。
const CARD_STATE: Record<string, { label: string; cls: string }> = {
  done: { label: '完成', cls: 'ss-badge-success' },
  running: { label: '執行中', cls: 'ss-badge-info' },
  not_run: { label: '未跑', cls: 'ss-badge-neutral' },
  not_applicable: { label: '不適用', cls: 'ss-badge-neutral' },
  failed: { label: '失敗', cls: 'ss-badge-error' },
  basis_changed: { label: '依據已變動', cls: 'ss-badge-warning' },
  not_implemented: { label: '尚未支援', cls: 'ss-badge-neutral' },
};

const PERSPECTIVES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'mystery', label: '推理視角' },
  { id: 'universal', label: '所有書都會跑' },
];

const panel: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
};
const eyebrow: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--font-size-2xs)',
  fontWeight: 600,
  letterSpacing: '0.06em',
  color: 'var(--fg-muted)',
};
const h2: CSSProperties = { margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', fontWeight: 600 };
const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.detail : String(error);
}

function chapterRange(chapters: number[]): string {
  if (chapters.length === 0) return '';
  const sorted = [...chapters].sort((a, b) => a - b);
  return sorted.length === 1 ? `第 ${sorted[0]} 章` : `第 ${sorted[0]}–${sorted[sorted.length - 1]} 章`;
}

function GenreSection({ bookId }: Readonly<{ bookId: string }>) {
  const { data: genre, error } = useGenre(bookId);
  if (error) return <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>讀不到題材判定：{errorText(error)}</p>;
  if (!genre) return null;
  const density = Object.entries((genre.mechanismDensity ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]);
  return (
    <section aria-labelledby="genre-h" style={{ ...panel, padding: 'var(--space-6)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-7)' }}>
      <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h2 id="genre-h" style={eyebrow}>題材判定</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>
            {genre.effectiveGenre ? genreLabel(genre.effectiveGenre) : '未判定'}
          </span>
          <span className="ss-badge ss-badge-success">{genre.override ? '使用者指定' : '主題材'}</span>
        </div>
        {genre.mixed.length > 0 && (
          <p style={{ ...small, color: 'var(--fg-secondary)', fontSize: 'var(--font-size-xs)' }}>
            混入：
            {genre.mixed
              .map((m) => `${genreLabel(m.genre)} ${m.score.toFixed(2)}${m.chapters.length ? `（${chapterRange(m.chapters)}）` : ''}`)
              .join('、')}
          </p>
        )}
        {genre.rationale && (
          <p style={{ ...small, fontSize: 'var(--font-size-xs)' }}>
            依據：{genre.rationale}
            {genre.detectedBy ? `；判定模型 ${genre.detectedBy}` : ''}
          </p>
        )}
      </div>
      {density.length > 0 && (
        <div style={{ flex: '2 1 480px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <span style={eyebrow}>七個機制的訊號密度</span>
          {density.map(([mechanism, value]) => (
            <div
              key={mechanism}
              style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr) 40px', alignItems: 'center', gap: 'var(--space-4)' }}
            >
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>{MECHANISMS[mechanism] ?? mechanism}</span>
              <span style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 2, overflow: 'hidden', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${Math.round(value * 100)}%`,
                    background: value === density[0][1] ? 'var(--accent)' : 'var(--fg-muted)',
                  }}
                />
              </span>
              <span style={{ ...small, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(value * 100)}%</span>
            </div>
          ))}
          <p style={{ ...small, marginTop: 'var(--space-2)' }}>
            密度＝有訊號的抽取單位 ÷ 全書單位數。訊號刻意標得寬，密度高不等於這個機制在書中份量重。
          </p>
        </div>
      )}
    </section>
  );
}

function ResultCard({ bookId, card }: Readonly<{ bookId: string; card: Card }>) {
  const trigger = useTriggerRun(bookId);
  const stateKey = card.implemented ? card.state : 'not_implemented';
  const state = CARD_STATE[stateKey] ?? CARD_STATE.not_run;
  const precheck = card.precheck as { howToFix?: string; missing?: string[] } | null;
  const opensDetail = card.runId !== null && (card.state === 'done' || card.state === 'basis_changed');
  const canRun = card.implemented && (card.state === 'not_run' || card.state === 'failed');
  const icon =
    stateKey === 'done' ? <Check size={12} aria-hidden="true" /> :
    stateKey === 'running' ? <Clock size={12} aria-hidden="true" /> :
    stateKey === 'basis_changed' || stateKey === 'failed' ? <AlertTriangle size={12} aria-hidden="true" /> : null; // prettier-ignore

  const body = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>{card.code ?? card.refId}</span>
        <span className={`ss-badge ${state.cls}`} style={{ alignItems: 'center', gap: 'var(--space-2)' }}>
          {icon}
          <span>{state.label}</span>
        </span>
      </div>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-base)', fontWeight: 600, lineHeight: 1.4 }}>{card.question}</span>
      {stateKey === 'not_implemented' && <span style={small}>原型只做部分方法；這張卡之後才支援。</span>}
      {card.state === 'not_applicable' && precheck && (
        <span style={{ ...small, color: 'var(--fg-secondary)' }}>
          {precheck.howToFix ?? `缺：${(precheck.missing ?? []).join('、')}`}
        </span>
      )}
      {card.state === 'basis_changed' && <span style={{ ...small, color: 'var(--fg-secondary)' }}>有上游證據被拒絕，這個結果待重跑。</span>}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', ...small, fontVariantNumeric: 'tabular-nums' }}>
        <span>{card.maxLevel ? `L${card.maxLevel}` : '—'}</span>
        <span>{card.finishedAt ? new Date(card.finishedAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : ''}</span>
      </div>
      {canRun && (
        <div>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate(card.refId)}
          >
            {card.state === 'failed' ? '重跑' : '執行'}
          </button>
          {trigger.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(trigger.error)}</p>}
        </div>
      )}
    </>
  );

  const style: CSSProperties = {
    ...panel,
    padding: 'var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    minHeight: 168,
    boxSizing: 'border-box',
    opacity: stateKey === 'not_implemented' ? 0.7 : 1,
  };
  return opensDetail ? (
    <Link className="ss-card-link" to={`/books/${bookId}/runs/${card.runId}`} style={{ ...style, color: 'inherit', textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}

function CardsSection({ bookId }: Readonly<{ bookId: string }>) {
  const { data: cards = [], error, isLoading } = useCards(bookId);
  const count = (state: string) => cards.filter((c) => c.implemented && c.state === state).length;
  const summary = [
    `${cards.length} 張`,
    `${count('done')} 完成`,
    count('running') ? `${count('running')} 執行中` : null,
    count('basis_changed') ? `${count('basis_changed')} 依據已變動` : null,
    cards.some((c) => !c.implemented) ? `${cards.filter((c) => !c.implemented).length} 尚未支援` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section aria-labelledby="cards-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <h2 id="cards-h" style={h2}>自動分析</h2>
        <span style={{ ...small, fontVariantNumeric: 'tabular-nums' }}>{summary}</span>
      </div>
      {isLoading && <p style={small}>讀取中…</p>}
      {error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>讀不到結果卡：{errorText(error)}</p>}
      {PERSPECTIVES.map((perspective) => {
        const group = cards.filter((c) => c.perspective === perspective.id);
        if (group.length === 0) return null;
        return (
          <div key={perspective.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', padding: '0 var(--space-1)' }}>
              <span style={eyebrow}>{perspective.label}</span>
              <span style={small}>
                {group.length} · 已完成 {group.filter((c) => c.state === 'done').length}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-5)' }}>
              {group.map((card) => (
                <ResultCard key={card.refId} bookId={bookId} card={card} />
              ))}
            </div>
          </div>
        );
      })}
      <p style={small}>結果卡只顯示第 2 層以上的證據；第 1 層在追溯時才出現。</p>
    </section>
  );
}

function AskableSection({ bookId }: Readonly<{ bookId: string }>) {
  const { data } = useAskable(bookId);
  const trigger = useTriggerRun(bookId);
  if (!data) return null;
  const askable = data.askable.filter((item) => item.implemented);
  const other = data.otherSignals;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
      <section aria-labelledby="ask-h" style={{ ...panel, flex: '3 1 480px', padding: 'var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-4)' }}>
          <h2 id="ask-h" style={h2}>也可以問</h2>
          <span style={small}>以下都會呼叫 LLM，消耗 token</span>
        </div>
        {askable.length === 0 ? (
          <p style={small}>原型目前沒有其他可以單獨執行的方法。</p>
        ) : (
          askable.map((item) => (
            <div key={item.refId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', padding: 'var(--space-3) 0', borderTop: 'var(--border-width) var(--border-style) var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{item.question}</span>
                <span style={small}>{[item.code, item.grade].filter(Boolean).join(' · ')}</span>
              </div>
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                disabled={trigger.isPending}
                onClick={() => trigger.mutate(item.refId)}
              >
                執行
              </button>
            </div>
          ))
        )}
        {trigger.error && <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>{errorText(trigger.error)}</p>}
        <p style={small}>清單裡沒有的問題，到 Agent 工作區問；大腦會組合現有方法來回答。</p>
      </section>
      {other.length > 0 && (
        <section aria-labelledby="sig-h" style={{ ...panel, flex: '2 1 320px', padding: 'var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h2 id="sig-h" style={h2}>也偵測到其他題材的訊號</h2>
          {other.map((signal) => (
            <div key={signal.mechanism} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3) 0', borderTop: 'var(--border-width) var(--border-style) var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
                  {[MECHANISMS[signal.mechanism] ?? signal.mechanism, `${Math.round(signal.density * 100)}%`, chapterRange(signal.chapters)].filter(Boolean).join(' · ')}
                </span>
                {!signal.supported && <span className="ss-badge ss-badge-neutral">尚未支援</span>}
              </div>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)' }}>{signal.suggestedQuestion}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** 畫面 3 書籍總覽（畫布 `Main.dc.html`，05 §3.1）。 */
export function OverviewPage() {
  const { bookId = '' } = useParams();
  const client = useQueryClient();
  const { data: book } = useBook(bookId);

  // 結果卡的狀態跟著 job／run 事件重抓（N-09f）。
  useEventStream(bookId ? `/books/${encodeURIComponent(bookId)}/events` : null, (event) => {
    if (event.type === 'run.status' || event.type === 'job.status' || event.type === 'basis.changed' || event.type === 'resync') {
      void client.invalidateQueries({ queryKey: queryKeys.book(bookId) });
    }
  });

  const meta = book ? [book.author, `${book.chapterCount} 章`].filter(Boolean).join(' · ') : undefined;
  return (
    <>
      <BookNav view="總覽" />
      <PageMain>
        <PageHeader
          title={book?.title ?? '…'}
          meta={meta}
          actions={
            <>
              <Link className="ss-btn ss-btn-md ss-btn-secondary" to={`/books/${bookId}/agent`} style={{ textDecoration: 'none' }}>
                Agent 工作區
              </Link>
              <Link className="ss-btn ss-btn-md ss-btn-secondary" to={`/books/${bookId}/notes`} style={{ textDecoration: 'none' }}>
                筆記
              </Link>
              <Link className="ss-btn ss-btn-md ss-btn-ghost" to={`/books/${bookId}/evidence`} style={{ textDecoration: 'none' }}>
                證據瀏覽
              </Link>
            </>
          }
        />
        <GenreSection bookId={bookId} />
        <CardsSection bookId={bookId} />
        <AskableSection bookId={bookId} />
      </PageMain>
    </>
  );
}
