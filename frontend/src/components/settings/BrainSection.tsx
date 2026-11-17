import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { TERMINAL } from '@/api/jobs';
import { useBrainSettings, type BrainSettings } from '@/api/agent';
import { useSaveBrainSettings, useStartBrainTest, useTestJob, type BrainTestResult, type LlmSettings } from '@/api/settings';
import { SettingsSection } from './SettingsSection';
import { errorStyle, noteStyle } from './styles';

type Backend = BrainSettings['defaultBackend'];

const CHECK_LABEL: Record<string, string> = {
  npx: 'npx',
  login: '已登入',
  adapter: 'adapter 可啟動',
  session: '建立 session',
  tool_call: '工具呼叫（list_genre_elements）',
};
const muted: CSSProperties = { fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)' };

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 上次這個大腦的測試結果：✓／✕ 一列。 */
function Checks({ result }: Readonly<{ result: BrainTestResult }>) {
  return (
    <span style={{ ...muted, display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2) var(--space-4)' }}>
      {result.checks.map((c) => (
        <span key={c.check} title={c.detail} style={c.ok ? undefined : { color: 'var(--color-error)' }}>
          {c.ok ? '✓' : '✕'} {CHECK_LABEL[c.check] ?? c.check}
        </span>
      ))}
    </span>
  );
}

function Option({
  id,
  selected,
  disabled,
  title,
  desc,
  onSelect,
  children,
}: Readonly<{ id: Backend; selected: boolean; disabled: boolean; title: string; desc: string; onSelect: (id: Backend) => void; children?: ReactNode }>) {
  return (
    <label className={`ss-option-card${selected ? ' selected' : ''}`} style={disabled ? { cursor: 'default' } : undefined}>
      <input type="radio" name="brain" checked={selected} disabled={disabled} onChange={() => onSelect(id)} style={{ marginTop: 'var(--space-1)' }} />
      <span className="ss-option-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <span className="ss-option-card-title">{title}</span>
        <span className="ss-option-card-desc">{desc}</span>
        {children}
      </span>
    </label>
  );
}

/**
 * Agent 大腦（05 §6、畫布 Settings.dc.html）：預設大腦（N-08e／f）、deepagents 的模型、Claude Code 的啟動命令、測試大腦（N-08g）。
 * 改了就存（不走上面 LLM 設定的草稿）；`deepagents.model` 就是任務路由的 `brain`，所以 LLM 設定有未存改動時先停用。
 */
export function BrainSection({ llm, llmDirty, latest }: Readonly<{ llm: LlmSettings | undefined; llmDirty: boolean; latest: BrainTestResult | null }>) {
  const client = useQueryClient();
  const { data: brain, error } = useBrainSettings();
  const save = useSaveBrainSettings();
  const start = useStartBrainTest();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useTestJob(jobId);
  const status = job.data?.status;
  const running = start.isPending || (jobId !== null && (!status || !TERMINAL.has(status)));

  // 測完：N-08e 的 `available` 會變，重抓。
  useEffect(() => {
    if (status && TERMINAL.has(status)) void client.invalidateQueries({ queryKey: ['settings', 'brain'] });
  }, [status, client]);

  if (error) return <p role="alert" style={errorStyle}>讀不到大腦設定：{errorText(error)}</p>;
  if (!brain) return null;

  const locked = llmDirty || save.isPending;
  const update = (next: Partial<BrainSettings>) => {
    const merged = { ...brain, ...next };
    save.mutate({ defaultBackend: merged.defaultBackend, deepagents: merged.deepagents, claudeCode: { launchCommand: merged.claudeCode.launchCommand } });
  };
  const chosen = brain.defaultBackend;
  const resultFor = (backend: Backend) => (latest && latest.backend === backend ? latest : null);

  return (
    <SettingsSection
      id="settings-brain"
      title="Agent 大腦"
      actions={
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
          disabled={chosen === 'none' || running || locked}
          title={chosen === 'none' ? '先選一個大腦' : '開暫時 session，請大腦呼叫一次 list_genre_elements（會呼叫 LLM 或 Claude Code）'}
          onClick={() => chosen !== 'none' && start.mutate({ backend: chosen }, { onSuccess: (data) => setJobId(data.jobId) })}
        >
          {running ? '測試中…' : '測試大腦'}
        </button>
      }
    >
      <p style={{ margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
        入庫和分析方法不經過大腦，用上面的任務路由。大腦只負責 Agent 工作區的提問。
      </p>
      {llmDirty && <p style={noteStyle}>上面的 LLM 設定有未儲存的改動；先儲存或捨棄，才能改大腦。</p>}

      <Option id="none" selected={chosen === 'none'} disabled={locked} title="無大腦" desc="只看自動結果卡、從「也可以問」點分析；Agent 工作區仍可手動選大腦開對話。" onSelect={(id) => update({ defaultBackend: id })} />

      <Option id="deepagents" selected={chosen === 'deepagents'} disabled={locked} title="deepagents" desc="內建、同一個程序；用你在上面設定的模型。" onSelect={(id) => update({ defaultBackend: id })}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>大腦模型</span>
          <select
            aria-label="deepagents 模型"
            disabled={locked}
            value={brain.deepagents.model ?? ''}
            onChange={(e) => update({ deepagents: { model: e.target.value || null } })}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--font-size-xs)',
              padding: 'var(--space-2) var(--space-4)',
              border: 'var(--input-border-width) solid var(--border)',
              borderRadius: 'var(--input-radius)',
              background: 'var(--input-bg)',
              color: 'var(--fg-primary)',
            }}
          >
            {!brain.deepagents.model && <option value="">（未設定）</option>}
            {(llm?.models ?? []).map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} · {m.modelId.split(':').pop()}
              </option>
            ))}
          </select>
        </span>
        {resultFor('deepagents') && <Checks result={resultFor('deepagents')!} />}
      </Option>

      <Option id="claude-code" selected={chosen === 'claude-code'} disabled={locked} title="Claude Code（ACP）" desc="用你本機已登入的 Claude Code；StorySphere 不碰憑證。" onSelect={(id) => update({ defaultBackend: id })}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-secondary)', background: 'var(--bg-secondary)', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-sm)', overflowWrap: 'anywhere' }}>
          {brain.claudeCode.launchCommand}
        </span>
        {resultFor('claude-code') ? (
          <Checks result={resultFor('claude-code')!} />
        ) : (
          <span style={muted}>{brain.claudeCode.available === null ? '還沒測過' : brain.claudeCode.available ? '上次測試通過' : '上次測試沒通過'}</span>
        )}
      </Option>

      {save.error && <p role="alert" style={errorStyle}>沒有儲存：{errorText(save.error)}</p>}
      {start.error && <p role="alert" style={errorStyle}>{errorText(start.error)}</p>}
      {status === 'error' && <p role="alert" style={errorStyle}>測試沒跑完：{job.data?.error ?? '未知錯誤'}</p>}
    </SettingsSection>
  );
}
