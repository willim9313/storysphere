import type { CSSProperties, ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { useMethodDetail, useViewCatalog } from '@/api/registryExtra';
import { ImplementedBadge, PriorityBadge } from './MethodTable';
import { implKindLabel, layerLabel, scopeLabel } from './labels';
import { panelStyle } from './styles';

const meta: CSSProperties = { fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' };
const value: CSSProperties = { fontSize: 'var(--font-size-xs)', color: 'var(--fg-primary)', lineHeight: 1.6 };
const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)' };
const rule: CSSProperties = { border: 'none', borderTop: 'var(--border-width) var(--border-style) var(--border)', margin: 0, width: '100%' };


function Row({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 'var(--space-4)', alignItems: 'baseline' }}>
      <span style={meta}>{label}</span>
      <span style={value}>{children}</span>
    </div>
  );
}

/** 方法宣告（N-07b），加推得的上下游與「用在結果卡」（N-07g 的視角設定）。 */
export function MethodDetailPanel({ methodId, codeOf }: Readonly<{ methodId: string; codeOf: (id: string) => string }>) {
  const { data: m, isLoading, error } = useMethodDetail(methodId);
  const { data: views } = useViewCatalog();
  if (isLoading) return <aside style={panelStyle}><span style={meta}>讀取中…</span></aside>;
  if (error || !m) {
    return (
      <aside style={panelStyle}>
        <span role="alert" style={{ ...meta, color: 'var(--color-error)' }}>
          讀不到宣告：{error instanceof ApiError ? error.detail : String(error)}
        </span>
      </aside>
    );
  }
  const cards = (views?.perspectives ?? []).flatMap((p) =>
    p.cards.filter((c) => c.refId === m.id || c.refId === m.code).map((c) => ({ genre: p.genre, question: c.question })),
  );
  return (
    <aside aria-labelledby="decl-h" style={panelStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--space-3)' }}>
        <h2 id="decl-h" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
          {m.code} 宣告
        </h2>
        <span style={{ ...meta, ...mono }}>
          {m.id} · v{m.version}
        </span>
      </div>
      <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>{m.question}</p>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <PriorityBadge priority={m.priority} />
        <ImplementedBadge implemented={m.implemented} />
        {m.allowInterpretation && <span className="ss-badge ss-badge-info">可附詮釋</span>}
      </div>
      <Row label="層／機制">
        {layerLabel(m.layer)} · {m.mechanism}
      </Row>
      <Row label="依據">{m.basis}</Row>
      <Row label="等級">{m.grade}</Row>
      <hr style={rule} />
      <Row label="需要">
        <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {m.requires.map((r) => (
            <span key={`${r.claimType}:${r.genreExt ?? ''}:${r.source ?? ''}`} style={mono}>
              {r.claimType}
              {r.genreExt ? ` · ${r.genreExt} 擴充` : ''}
              {r.source ? ` · 來源 ${r.source}` : ''}
              {r.optional ? '（選用）' : ''}
            </span>
          ))}
        </span>
      </Row>
      <Row label="前提">
        {m.preconditions.length === 0 ? '—' : <span style={mono}>{m.preconditions.map((p) => `存在 ${p.exists}`).join('、')}</span>}
      </Row>
      <Row label="產出">
        <span style={mono}>{m.produces}</span>
      </Row>
      <Row label="範圍">
        {scopeLabel(m.scope)}
        {m.scopeSelector && <span style={{ ...mono, color: 'var(--fg-muted)' }}> · {m.scopeSelector}</span>}
      </Row>
      <Row label="view">
        <span style={mono}>{m.view}</span>
      </Row>
      <Row label="做法">
        {implKindLabel(m.impl.kind)}
        {m.impl.llmTask && <span style={{ ...mono, color: 'var(--fg-muted)' }}> · {m.impl.llmTask}</span>}
      </Row>
      <Row label="實作">
        <span style={{ ...mono, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span>{m.impl.module}</span>
          {m.impl.prompt && <span>{m.impl.prompt}</span>}
          {m.impl.config.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </span>
      </Row>
      <hr style={rule} />
      <Row label="下游方法">{m.downstreamMethods.length === 0 ? '—' : m.downstreamMethods.map(codeOf).join('、')}</Row>
      <Row label="用在方法論">{m.usedByMethodologies.length === 0 ? '—' : m.usedByMethodologies.map(codeOf).join('、')}</Row>
      <Row label="用在結果卡">{cards.length === 0 ? '—' : cards.map((c) => `${c.genre} ·「${c.question}」`).join('、')}</Row>
    </aside>
  );
}
