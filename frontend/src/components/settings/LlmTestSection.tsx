import { useState } from 'react';
import { ApiError } from '@/api/client';
import { TERMINAL } from '@/api/jobs';
import { useStartLlmTest, useTestJob, type LlmTestResult } from '@/api/settings';
import { SettingsSection } from './SettingsSection';
import { errorStyle, noteStyle, rowBorder, tdStyle, thStyle } from './styles';

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.detail : String(error);
}

function Mark({ ok, tested }: Readonly<{ ok: boolean; tested: boolean }>) {
  if (!tested) return <span style={{ color: 'var(--fg-muted)' }}>未測</span>;
  return ok ? <span>✓ 通過</span> : <span style={{ color: 'var(--color-error)' }}>✕ 失敗</span>;
}

function summary(result: LlmTestResult): string | null {
  const broken = result.rows.filter((r) => !(r.connect && r.structuredOutput));
  if (broken.length === 0) return null;
  return broken
    .map((r) => (r.affectedTasks.length > 0 ? `${r.model} 不可用，影響 ${r.affectedTasks.join('、')}` : `${r.model} 不可用，目前沒有 task 用到它`))
    .join('；');
}

/** 初次啟動測試：N-08c 開 job、N-09b 輪詢、結束後重抓 N-08d 的表。測的是已儲存的設定。 */
export function LlmTestSection({
  result,
  finishedAt,
  latestError,
  dirty,
}: Readonly<{ result: LlmTestResult | null; finishedAt: string | null; latestError: unknown; dirty: boolean }>) {
  const [jobId, setJobId] = useState<string | null>(null);
  const start = useStartLlmTest();
  const job = useTestJob(jobId);
  const status = job.data?.status;
  const running = start.isPending || (jobId !== null && (!status || !TERMINAL.has(status)));
  const affected = result ? summary(result) : null;

  return (
    <SettingsSection
      id="settings-test"
      title="初次啟動測試"
      actions={
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
          disabled={running || dirty}
          title={dirty ? '先儲存設定再測試' : '每個模型跑連線、structured output、延遲（會呼叫 LLM）'}
          onClick={() => start.mutate({}, { onSuccess: (data) => setJobId(data.jobId) })}
        >
          {running ? '測試中…' : result ? '重新測試' : '開始測試'}
        </button>
      }
    >
      {dirty && <p style={noteStyle}>設定有未儲存的改動；測試用的是已儲存的設定。</p>}
      {start.error && <p role="alert" style={errorStyle}>{errorText(start.error)}</p>}
      {job.error && <p role="alert" style={errorStyle}>讀不到測試進度：{errorText(job.error)}</p>}
      {status === 'error' && <p role="alert" style={errorStyle}>測試沒跑完：{job.data?.error ?? '未知錯誤'}</p>}
      {status === 'cancelled' && <p style={noteStyle}>測試已取消。</p>}
      {latestError != null && <p role="alert" style={errorStyle}>讀不到上次的測試：{errorText(latestError)}</p>}

      {result ? (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>模型</th>
                  <th scope="col" style={thStyle}>連線</th>
                  <th scope="col" style={thStyle}>結構化輸出</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'right', paddingRight: 0 }}>延遲</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.model} style={rowBorder}>
                    <td style={tdStyle}>
                      <div>{r.model}</div>
                      <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}>{r.provider}</div>
                      {r.error && (
                        <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-error)', fontFamily: 'var(--font-mono)', wordBreak: 'break-word', marginTop: 'var(--space-1)' }}>
                          {r.error}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}><Mark ok={r.connect} tested /></td>
                    <td style={tdStyle}><Mark ok={r.structuredOutput} tested={r.connect} /></td>
                    <td style={{ ...tdStyle, paddingRight: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.latencyMs === null ? 'var(--fg-muted)' : undefined }}>
                      {r.latencyMs === null ? '—' : `${r.latencyMs.toLocaleString()} ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {affected && <p style={{ ...noteStyle, color: 'var(--fg-secondary)' }}>受影響：{affected}。</p>}
          {result.noUsableModel && (
            <p role="alert" style={errorStyle}>
              沒有可用的模型，入庫和分析都無法執行。可以檢查金鑰的環境變數，或新增一個本地模型來源（Ollama／vLLM，類型選「OpenAI 相容」並填 base URL）。
            </p>
          )}
          {finishedAt && <p style={noteStyle}>上次測試：{new Date(finishedAt).toLocaleString('zh-TW')}</p>}
        </>
      ) : (
        !running && <p style={noteStyle}>還沒測過。每個模型會跑連線、structured output、延遲三項。</p>
      )}
    </SettingsSection>
  );
}
