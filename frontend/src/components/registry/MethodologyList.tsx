import type { CSSProperties } from 'react';
import type { Methodology } from '@/api/registryExtra';
import { ImplementedBadge, PriorityBadge } from './MethodTable';
import { ownerLabel } from './labels';
import { panelStyle } from './styles';

const meta: CSSProperties = { fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' };
const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)' };

/** 方法論清單（N-07c）：內建與使用者存下的；步驟是已登錄的方法，最後一步可能是綜合。 */
export function MethodologyList({
  methodologies,
  codeOf,
  onSelectMethod,
}: Readonly<{ methodologies: Methodology[]; codeOf: (id: string) => string; onSelectMethod: (id: string) => void }>) {
  if (methodologies.length === 0) return <p style={meta}>還沒有方法論。</p>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', gap: 'var(--space-6)' }}>
      {methodologies.map((m) => (
        <article key={m.id} aria-labelledby={`mdl-${m.id}`} style={panelStyle}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--space-3)' }}>
            <h2 id={`mdl-${m.id}`} style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
              {m.code ?? m.id}
            </h2>
            <span style={{ ...meta, ...mono }}>
              {m.id} · v{m.version}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
              <span className="ss-badge ss-badge-neutral">{ownerLabel(m.owner)}</span>
              <PriorityBadge priority={m.priority} />
              <ImplementedBadge implemented={m.implemented} />
            </span>
          </div>
          <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>{m.question}</p>
          <span style={meta}>
            {m.grade}
            {m.basis ? ` · ${m.basis}` : ''}
            {m.view ? ` · view ${m.view}` : ''}
          </span>
          <ol style={{ margin: 0, paddingLeft: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
            {m.steps.map((step, i) =>
              step.method ? (
                <li key={`${i}:${step.method}`}>
                  <button
                    type="button"
                    onClick={() => onSelectMethod(step.method!)}
                    style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent)', ...mono, fontSize: 'var(--font-size-xs)' }}
                  >
                    {codeOf(step.method)}
                  </button>
                  <span style={{ ...meta, marginLeft: 'var(--space-2)' }}>{step.method}</span>
                </li>
              ) : (
                <li key={`${i}:synthesis`}>
                  綜合 → <span style={mono}>{step.synthesis?.produces ?? '—'}</span>
                  {step.synthesis && <span style={{ ...meta, marginLeft: 'var(--space-2)' }}>{step.synthesis.llmTask}</span>}
                </li>
              ),
            )}
          </ol>
        </article>
      ))}
    </div>
  );
}
