import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { LlmSettings, LlmTestRow, Provider } from '@/api/settings';
import { SettingsSection } from './SettingsSection';
import { errorStyle, inputStyle, noteStyle, rowBorder } from './styles';

// 與後端 storysphere/llm/settings.py 一致：只收環境變數「名稱」。
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
const NAME = /^[A-Za-z0-9_-]+$/;
const PROVIDER_TYPES = ['api_key', 'subscription', 'openai_compatible'] as const;
const VIA_OPTIONS = ['claude_agent_sdk', 'chatgpt_login'] as const;
const CAPS = ['structured_output', 'long_context', 'reasoning'] as const;

const TYPE_LABEL: Record<string, string> = {
  api_key: 'API key',
  subscription: '訂閱',
  openai_compatible: 'OpenAI 相容',
};
const VIA_LABEL: Record<string, string> = {
  claude_agent_sdk: '經 Claude Agent SDK 登入',
  chatgpt_login: '經 ChatGPT 登入',
};

const gridRow = {
  display: 'grid',
  gridTemplateColumns: '110px minmax(0, 1fr) auto auto',
  gap: 'var(--space-4)',
  alignItems: 'center',
  padding: 'var(--space-4) 0',
  ...rowBorder,
} as const;

function providerDetail(p: Provider) {
  const mono = { fontFamily: 'var(--font-mono)' };
  if (p.type === 'subscription') return <>訂閱 · {VIA_LABEL[p.via ?? ''] ?? p.via ?? '未指定登入方式'}</>;
  if (p.type === 'openai_compatible')
    return (
      <>
        OpenAI 相容 · <span style={mono}>{p.baseUrl}</span>
        {p.apiKeyEnv && <> · <span style={mono}>{p.apiKeyEnv}</span></>}
      </>
    );
  return (
    <>
      {TYPE_LABEL[p.type] ?? p.type} · <span style={mono}>{p.apiKeyEnv}</span>
    </>
  );
}

function ProviderBadge({ provider, unreachable }: Readonly<{ provider: Provider; unreachable: boolean }>) {
  if (unreachable) return <span className="ss-badge ss-badge-error">連不上</span>;
  if (provider.type === 'subscription') return <span className="ss-badge ss-badge-warning">有條款風險</span>;
  return provider.configured ? (
    <span className="ss-badge ss-badge-success">已設定</span>
  ) : (
    <span className="ss-badge ss-badge-neutral">未設定</span>
  );
}

function RemoveButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" aria-label={label} title={label} onClick={onClick}>
      <X size={14} aria-hidden="true" />
    </button>
  );
}

function AddProviderForm({
  existing,
  onAdd,
  onCancel,
}: Readonly<{ existing: string[]; onAdd: (p: Provider) => void; onCancel: () => void }>) {
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('api_key');
  const [apiKeyEnv, setApiKeyEnv] = useState('');
  const [via, setVia] = useState<string>(VIA_OPTIONS[0]);
  const [baseUrl, setBaseUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const env = apiKeyEnv.trim();
    if (!NAME.test(name)) return setProblem('名稱只能用英數字、底線、連字號。');
    if (existing.includes(name)) return setProblem('已有同名的來源。');
    if (type === 'api_key' && !env) return setProblem('API key 來源要填環境變數名稱。');
    if (env && !ENV_NAME.test(env)) {
      // 不回顯輸入值：它可能是誤貼的 key。
      setApiKeyEnv('');
      return setProblem('這裡只能填環境變數名稱（大寫英數字與底線，例如 OPENAI_API_KEY），不要貼 key 本身。');
    }
    if (type === 'openai_compatible' && !baseUrl.trim()) return setProblem('OpenAI 相容來源要填 base URL。');
    onAdd({
      name,
      type,
      apiKeyEnv: type === 'subscription' ? null : env || null,
      via: type === 'subscription' ? via : null,
      baseUrl: type === 'openai_compatible' ? baseUrl.trim() : null,
      configured: false,
      riskNotice: null,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4) 0', ...rowBorder }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <input aria-label="來源名稱" placeholder="名稱，如 openai" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: 140 }} />
        <select aria-label="來源類型" value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
          {PROVIDER_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        {type === 'subscription' ? (
          <select aria-label="登入方式" value={via} onChange={(e) => setVia(e.target.value)} style={inputStyle}>
            {VIA_OPTIONS.map((v) => (
              <option key={v} value={v}>{VIA_LABEL[v]}</option>
            ))}
          </select>
        ) : (
          <input
            aria-label="金鑰的環境變數名稱"
            placeholder={type === 'api_key' ? '環境變數名，如 OPENAI_API_KEY' : '環境變數名（選填）'}
            value={apiKeyEnv}
            onChange={(e) => setApiKeyEnv(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: 1, minWidth: 200 }}
          />
        )}
        {type === 'openai_compatible' && (
          <input aria-label="base URL" placeholder="http://localhost:8000/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: 1, minWidth: 200 }} />
        )}
      </div>
      <p style={noteStyle}>金鑰只記環境變數名，值放在啟動後端的環境裡。</p>
      {problem && <p role="alert" style={errorStyle}>{problem}</p>}
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button type="submit" className="ss-btn ss-btn-sm ss-btn-secondary">加入</button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}

function AddModelForm({
  providers,
  existing,
  onAdd,
  onCancel,
}: Readonly<{
  providers: string[];
  existing: string[];
  onAdd: (m: LlmSettings['models'][number]) => void;
  onCancel: () => void;
}>) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState(providers[0] ?? '');
  const [modelId, setModelId] = useState('');
  const [caps, setCaps] = useState<string[]>(['structured_output']);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!NAME.test(name)) return setProblem('名稱只能用英數字、底線、連字號。');
    if (existing.includes(name)) return setProblem('已有同名的模型。');
    if (!provider) return setProblem('先新增一個來源。');
    if (!modelId.trim()) return setProblem('要填模型 ID。');
    onAdd({ name, provider, modelId: modelId.trim(), caps });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4) 0', ...rowBorder }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <input aria-label="模型名稱" placeholder="名稱，如 strong" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        <select aria-label="模型來源" value={provider} onChange={(e) => setProvider(e.target.value)} style={inputStyle}>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input aria-label="模型 ID" placeholder="google_genai:gemini-2.5-pro" value={modelId} onChange={(e) => setModelId(e.target.value)} spellCheck={false} style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: 1, minWidth: 200 }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', fontSize: 'var(--font-size-xs)' }}>
        {CAPS.map((cap) => (
          <label key={cap} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={caps.includes(cap)}
              onChange={(e) => setCaps(e.target.checked ? [...caps, cap] : caps.filter((c) => c !== cap))}
            />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{cap}</span>
          </label>
        ))}
      </div>
      <p style={noteStyle}>模型 ID 用「整合:模型」，如 google_genai:gemini-2.5-pro；OpenAI 相容與訂閱來源不帶前綴。</p>
      {problem && <p role="alert" style={errorStyle}>{problem}</p>}
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button type="submit" className="ss-btn ss-btn-sm ss-btn-secondary">加入</button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}

/** 模型來源（provider）與模型（model）兩層；改動只進草稿，按「儲存」才寫 N-08b。 */
export function ProvidersSection({
  settings,
  testRows,
  onChange,
}: Readonly<{ settings: LlmSettings; testRows: LlmTestRow[]; onChange: (next: LlmSettings) => void }>) {
  const [adding, setAdding] = useState<'provider' | 'model' | null>(null);
  const unreachable = new Set(testRows.filter((r) => !r.connect).map((r) => r.provider));
  const reachable = new Set(testRows.filter((r) => r.connect).map((r) => r.provider));

  return (
    <SettingsSection
      id="settings-providers"
      title="模型來源"
      actions={
        <>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setAdding('provider')}>新增來源</button>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setAdding('model')} disabled={settings.providers.length === 0}>新增模型</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {settings.providers.map((p) => (
          <div key={p.name}>
            <div style={gridRow}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>{p.name}</span>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', overflowWrap: 'anywhere' }}>{providerDetail(p)}</span>
              <ProviderBadge provider={p} unreachable={unreachable.has(p.name) && !reachable.has(p.name)} />
              <RemoveButton
                label={`移除來源 ${p.name}`}
                onClick={() => onChange({ ...settings, providers: settings.providers.filter((x) => x.name !== p.name) })}
              />
            </div>
            {p.type === 'subscription' && (
              <p
                style={{
                  margin: '0 0 var(--space-3)',
                  padding: 'var(--space-4) var(--space-5)',
                  background: 'var(--color-warning-bg)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-2xs)',
                  color: 'var(--fg-primary)',
                  lineHeight: 1.6,
                }}
              >
                {p.riskNotice ?? '訂閱來源有條款風險，儲存後顯示完整說明。'}
              </p>
            )}
          </div>
        ))}
        {adding === 'provider' && (
          <AddProviderForm
            existing={settings.providers.map((p) => p.name)}
            onCancel={() => setAdding(null)}
            onAdd={(p) => {
              onChange({ ...settings, providers: [...settings.providers, p] });
              setAdding(null);
            }}
          />
        )}
      </div>

      <h3 style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--fg-muted)' }}>模型</h3>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {settings.models.map((m) => (
          <div key={m.name} style={gridRow}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>{m.name}</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', overflowWrap: 'anywhere' }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{m.modelId}</span> · {m.provider}
              {m.caps.length > 0 && <span style={{ color: 'var(--fg-muted)' }}> · {m.caps.join('、')}</span>}
            </span>
            <span />
            <RemoveButton
              label={`移除模型 ${m.name}`}
              onClick={() => onChange({ ...settings, models: settings.models.filter((x) => x.name !== m.name) })}
            />
          </div>
        ))}
        {adding === 'model' && (
          <AddModelForm
            providers={settings.providers.map((p) => p.name)}
            existing={settings.models.map((m) => m.name)}
            onCancel={() => setAdding(null)}
            onAdd={(m) => {
              onChange({ ...settings, models: [...settings.models, m] });
              setAdding(null);
            }}
          />
        )}
      </div>
    </SettingsSection>
  );
}
