import { useState } from 'react';
import { ApiError } from '@/api/client';
import {
  useLatestLlmTest,
  useLlmSettings,
  useSaveLlmSettings,
  type LlmSettings,
} from '@/api/settings';
import { PageHeader, PageMain } from '@/components/layout/PageMain';
import { LlmTestSection } from '@/components/settings/LlmTestSection';
import { AppearanceSection, DevViewSection } from '@/components/settings/PreferenceSections';
import { ProvidersSection } from '@/components/settings/ProvidersSection';
import { TaskRoutingSection } from '@/components/settings/TaskRoutingSection';
import { errorStyle } from '@/components/settings/styles';

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 設定頁（05 §6）：LLM 三層設定、初次啟動測試、外觀、開發者檢視。Agent 大腦屬 T25，這裡不做。 */
export function SettingsPage() {
  const settings = useLlmSettings();
  const latest = useLatestLlmTest();
  const save = useSaveLlmSettings();
  // null＝沒有改動，直接顯示伺服器的設定；改了才有草稿，儲存或捨棄後回到 null。
  const [draft, setDraft] = useState<LlmSettings | null>(null);
  const current = draft ?? settings.data;
  const dirty = draft !== null;

  const llmTest = latest.data?.llmTest ?? null;
  const testResult = llmTest?.result ?? null;
  const testRows = testResult?.rows ?? [];

  function edit(next: LlmSettings) {
    save.reset();
    setDraft(next);
  }

  return (
    <PageMain>
      <PageHeader
        title="設定"
        meta="設定存在 var/settings.yaml；金鑰只記環境變數名，不存值。"
        actions={
          dirty && (
            <>
              <button type="button" className="ss-btn ss-btn-md ss-btn-ghost" disabled={save.isPending} onClick={() => { save.reset(); setDraft(null); }}>
                捨棄改動
              </button>
              <button
                type="button"
                className="ss-btn ss-btn-md ss-btn-primary"
                disabled={save.isPending}
                onClick={() => draft && save.mutate(draft, { onSuccess: () => setDraft(null) })}
              >
                {save.isPending ? '儲存中…' : '儲存設定'}
              </button>
            </>
          )
        }
      />

      {save.error && (
        <p role="alert" style={errorStyle}>
          沒有儲存：{errorText(save.error)}
        </p>
      )}
      {settings.error && (
        <p role="alert" style={errorStyle}>
          讀不到 LLM 設定：{errorText(settings.error)}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(520px, 100%), 1fr))',
          gap: 'var(--space-6)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          {current && (
            <>
              <ProvidersSection settings={current} testRows={testRows} onChange={edit} />
              <TaskRoutingSection settings={current} testRows={testRows} onChange={edit} />
            </>
          )}
          {settings.isPending && <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 'var(--font-size-xs)' }}>讀取設定中…</p>}
          <LlmTestSection
            result={testResult}
            finishedAt={llmTest?.finishedAt ?? null}
            latestError={latest.error}
            dirty={dirty}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          <AppearanceSection />
          <DevViewSection />
        </div>
      </div>
    </PageMain>
  );
}
