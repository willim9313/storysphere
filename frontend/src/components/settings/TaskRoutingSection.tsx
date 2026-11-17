import { X } from 'lucide-react';
import type { LlmSettings, LlmTestRow, TaskRoute } from '@/api/settings';
import { SettingsSection } from './SettingsSection';
import { inputStyle, noteStyle, rowBorder, tdStyle, thStyle } from './styles';

/** 主模型與每個備援都要具備 task 的 requires（同後端 caps_ok）。 */
function capsMissing(settings: LlmSettings, task: TaskRoute): boolean {
  if (!task.model) return false;
  const caps = new Map(settings.models.map((m) => [m.name, m.caps]));
  return [task.model, ...task.fallback].some((name) => {
    const have = caps.get(name);
    return !have || task.requires.some((req) => !have.includes(req));
  });
}

function check(settings: LlmSettings, task: TaskRoute, failed: Set<string>): { label: string; cls: string } {
  if (!task.model) return { label: '未設定', cls: 'ss-badge ss-badge-neutral' };
  if (capsMissing(settings, task)) return { label: '能力不符', cls: 'ss-badge ss-badge-error' };
  if (failed.has(task.model)) return { label: '主模型不可用', cls: 'ss-badge ss-badge-error' };
  if (task.fallback.some((f) => failed.has(f))) return { label: '備援不可用', cls: 'ss-badge ss-badge-warning' };
  return { label: '可用', cls: 'ss-badge ss-badge-success' };
}

/** task → 主模型＋備援。`requires` 是 task 本身的需求，這裡只顯示不改。 */
export function TaskRoutingSection({
  settings,
  testRows,
  onChange,
}: Readonly<{ settings: LlmSettings; testRows: LlmTestRow[]; onChange: (next: LlmSettings) => void }>) {
  const failed = new Set(testRows.filter((r) => !(r.connect && r.structuredOutput)).map((r) => r.model));
  const modelNames = settings.models.map((m) => m.name);

  function update(task: string, patch: Partial<TaskRoute>) {
    onChange({ ...settings, tasks: settings.tasks.map((t) => (t.task === task ? { ...t, ...patch } : t)) });
  }

  return (
    <SettingsSection id="settings-tasks" title="任務路由">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
          <thead>
            <tr>
              <th scope="col" style={thStyle}>task</th>
              <th scope="col" style={thStyle}>模型</th>
              <th scope="col" style={thStyle}>備援</th>
              <th scope="col" style={{ ...thStyle, paddingRight: 0 }}>檢查</th>
            </tr>
          </thead>
          <tbody>
            {settings.tasks.map((t) => {
              const status = check(settings, t, failed);
              const candidates = modelNames.filter((n) => n !== t.model && !t.fallback.includes(n));
              return (
                <tr key={t.task} style={rowBorder}>
                  <td style={tdStyle}>
                    <div style={{ fontFamily: 'var(--font-mono)' }}>{t.task}</div>
                    {t.requires.length > 0 && (
                      <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>需要 {t.requires.join('、')}</div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <select
                      aria-label={`${t.task} 的模型`}
                      value={t.model ?? ''}
                      onChange={(e) => {
                        const model = e.target.value || null;
                        update(t.task, { model, fallback: t.fallback.filter((f) => f !== model) });
                      }}
                      style={inputStyle}
                    >
                      <option value="">未設定</option>
                      {modelNames.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                      {t.model && !modelNames.includes(t.model) && <option value={t.model}>{t.model}（已移除）</option>}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                      {t.fallback.map((f) => (
                        <span key={f} className="ss-badge ss-badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                          {f}
                          <button
                            type="button"
                            aria-label={`移除備援 ${f}`}
                            onClick={() => update(t.task, { fallback: t.fallback.filter((x) => x !== f) })}
                            style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'inline-flex' }}
                          >
                            <X size={12} aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                      {t.model && candidates.length > 0 && (
                        <select
                          aria-label={`加入 ${t.task} 的備援`}
                          value=""
                          onChange={(e) => e.target.value && update(t.task, { fallback: [...t.fallback, e.target.value] })}
                          style={{ ...inputStyle, color: 'var(--fg-secondary)' }}
                        >
                          <option value="">＋備援</option>
                          {candidates.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      )}
                      {!t.model && <span style={{ color: 'var(--fg-muted)' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, paddingRight: 0 }}>
                    <span className={status.cls}>{status.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={noteStyle}>
        task 的需求（structured output、長上下文）和模型能力不符時，儲存會被擋下。「不可用」依上次的初次啟動測試；未設定的 task 不寫入設定檔。
      </p>
    </SettingsSection>
  );
}
