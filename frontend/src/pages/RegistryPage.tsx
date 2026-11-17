import { useCallback, useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useMethods } from '@/api/registry';
import { useMethodologies } from '@/api/registryExtra';
import { PageMain, PageHeader } from '@/components/layout/PageMain';
import { EvidenceDag } from '@/components/registry/EvidenceDag';
import { MethodDetailPanel } from '@/components/registry/MethodDetailPanel';
import { MethodTable } from '@/components/registry/MethodTable';
import { MethodologyList } from '@/components/registry/MethodologyList';
import { LAYERS, layerLabel } from '@/components/registry/labels';
import { panelStyle } from '@/components/registry/styles';

type Tab = 'methods' | 'methodologies' | 'dag';

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };
const control: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--font-size-xs)',
  padding: 'var(--space-3) var(--space-5)',
  border: 'var(--input-border-width) solid var(--border)',
  borderRadius: 'var(--input-radius)',
  background: 'var(--input-bg)',
  color: 'var(--fg-primary)',
};

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 畫面 8 方法目錄（05 §3）：方法清單＋宣告、方法論、證據 DAG。分頁、層篩選、選中的方法存在網址。 */
export function RegistryPage() {
  const [params, setParams] = useSearchParams();
  const methods = useMethods();
  const methodologies = useMethodologies();
  const tab = (['methodologies', 'dag'].includes(params.get('tab') ?? '') ? params.get('tab') : 'methods') as Tab;
  const layer = params.get('layer') ?? '';
  const selectedId = params.get('m');

  const update = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const allMethods = useMemo(() => methods.data ?? [], [methods.data]);
  const allMethodologies = useMemo(() => methodologies.data ?? [], [methodologies.data]);
  const shown = layer ? allMethods.filter((m) => m.layer === layer) : allMethods;
  const codes = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allMethods) map.set(m.id, m.code);
    for (const m of allMethodologies) if (m.code) map.set(m.id, m.code);
    return map;
  }, [allMethods, allMethodologies]);
  const codeOf = useCallback((id: string) => codes.get(id) ?? id, [codes]);
  const openMethod = useCallback((id: string) => update({ tab: null, m: id }), [update]);

  const p0 = allMethods.filter((m) => m.priority === 'P0').length;
  const implemented = allMethods.filter((m) => m.implemented).length;
  const meta = methods.data
    ? `${allMethods.length} 個方法＋${allMethodologies.length} 個方法論 · P0 ${p0} 個 · 已實作 ${implemented} 個`
    : '…';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'methods', label: `方法 ${allMethods.length}` },
    { id: 'methodologies', label: `方法論 ${allMethodologies.length}` },
    { id: 'dag', label: '證據 DAG' },
  ];

  return (
    <PageMain>
      <PageHeader title="方法目錄" meta={meta} />

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
        <nav className="ss-tabs" aria-label="檢視">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ss-tab${tab === t.id ? ' active' : ''}`}
              aria-pressed={tab === t.id}
              onClick={() => update({ tab: t.id === 'methods' ? null : t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === 'methods' && (
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
            <label htmlFor="reg-layer" style={small}>
              層
            </label>
            <select id="reg-layer" value={layer} onChange={(e) => update({ layer: e.target.value })} style={control}>
              <option value="">全部</option>
              {LAYERS.map((l) => (
                <option key={l} value={l}>
                  {layerLabel(l)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {(methods.error || methodologies.error) && (
        <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>
          讀不到 registry：{errorText(methods.error ?? methodologies.error)}
        </p>
      )}
      {methods.isLoading && <p style={small}>讀取中…</p>}

      {tab === 'methods' && methods.data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
          <section aria-label="方法清單" style={{ ...panelStyle, padding: 0, gap: 0, flex: '999 1 640px', minWidth: 0, overflowX: 'auto' }}>
            <MethodTable methods={shown} selectedId={selectedId} onSelect={(id) => update({ m: id })} />
          </section>
          <div style={{ flex: '1 1 360px', minWidth: 0, position: 'sticky', top: 'var(--space-5)' }}>
            {selectedId ? (
              <MethodDetailPanel key={selectedId} methodId={selectedId} codeOf={codeOf} />
            ) : (
              <aside style={panelStyle}>
                <p style={small}>點一列看方法的完整宣告、上下游與用在哪張結果卡。</p>
              </aside>
            )}
          </div>
        </div>
      )}

      {tab === 'methodologies' && methodologies.data && (
        <MethodologyList methodologies={allMethodologies} codeOf={codeOf} onSelectMethod={openMethod} />
      )}

      {tab === 'dag' && <EvidenceDag methods={allMethods} methodologies={allMethodologies} onOpenMethod={openMethod} />}
    </PageMain>
  );
}
