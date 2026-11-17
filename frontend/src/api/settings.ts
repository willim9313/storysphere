import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type Schemas } from './client';
import { TERMINAL, type Job } from './jobs';

export type LlmSettings = Schemas['LlmSettingsOut'];
export type Provider = Schemas['ProviderOut'];
export type Model = Schemas['ModelOut'];
export type TaskRoute = Schemas['TaskOut'];

const settingsKeys = {
  llm: ['settings', 'llm'] as const,
  latestTest: ['settings', 'llm', 'test', 'latest'] as const,
  job: (jobId: string) => ['settings', 'job', jobId] as const,
};

/** N-08a 三層設定。 */
export function useLlmSettings() {
  return useQuery({
    queryKey: settingsKeys.llm,
    queryFn: () => apiFetch<LlmSettings>('/settings/llm'),
  });
}

/** N-08b 寫回整份設定；推得欄位（configured、riskNotice、capsOk）可以照帶，後端不採用。 */
export function useSaveLlmSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['LlmSettingsIn']) =>
      apiFetch<LlmSettings>('/settings/llm', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      client.setQueryData(settingsKeys.llm, data);
      void client.invalidateQueries({ queryKey: settingsKeys.llm });
    },
  });
}

/** N-08d 上次的測試表。 */
export function useLatestLlmTest() {
  return useQuery({
    queryKey: settingsKeys.latestTest,
    queryFn: () => apiFetch<Schemas['LatestTests']>('/settings/llm/test/latest'),
  });
}

/** N-08c 開始初次啟動測試（建 `llm_test` job；會呼叫 LLM）。 */
export function useStartLlmTest() {
  return useMutation({
    mutationFn: (body: Schemas['LlmTestIn']) =>
      apiFetch<Schemas['JobAccepted']>('/settings/llm/test', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

/** N-09b 輪詢 job 直到終態；結束時重抓 N-08d。 */
export function useTestJob(jobId: string | null) {
  const client = useQueryClient();
  return useQuery({
    queryKey: settingsKeys.job(jobId ?? ''),
    enabled: jobId !== null,
    queryFn: async () => {
      const job = await apiFetch<Job>(`/jobs/${encodeURIComponent(jobId ?? '')}`);
      if (TERMINAL.has(job.status)) {
        void client.invalidateQueries({ queryKey: settingsKeys.latestTest });
      }
      return job;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL.has(status) ? false : 1500;
    },
  });
}

// N-08d 的 `result`（startup_test.LlmTestResult）。型別取自 generated.ts。
export type LlmTestRow = Schemas['LlmTestRow'];
export type LlmTestResult = Schemas['LlmTestResult'];
