import { apiFetch } from './client';

export interface TokenBucket {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export interface DailyUsage extends TokenBucket {
  date: string;
}

export interface TokenUsageResponse {
  summary: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCalls: number;
  };
  byService: Record<string, TokenBucket>;
  byModel: Record<string, TokenBucket>;
  daily: DailyUsage[];
}

export function fetchTokenUsage(range: string): Promise<TokenUsageResponse> {
  return apiFetch<TokenUsageResponse>(`/token-usage?range=${range}`);
}
