import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type {
  CharacterAnalysisRequest,
  EventAnalysisRequest,
  TaskStatus,
} from './types';

export function triggerCharacterAnalysis(
  req: CharacterAnalysisRequest,
): Promise<TaskStatus> {
  if (MOCK_ENABLED) return mock.triggerCharacterAnalysis();
  return apiFetch<TaskStatus>('/analysis/character', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function pollCharacterAnalysis(taskId: string): Promise<TaskStatus> {
  if (MOCK_ENABLED) return mock.pollCharacterAnalysis(taskId);
  return apiFetch<TaskStatus>(`/analysis/character/${taskId}`);
}

export function triggerEventAnalysis(
  req: EventAnalysisRequest,
): Promise<TaskStatus> {
  if (MOCK_ENABLED) return mock.triggerEventAnalysis();
  return apiFetch<TaskStatus>('/analysis/event', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function pollEventAnalysis(taskId: string): Promise<TaskStatus> {
  if (MOCK_ENABLED) return mock.pollEventAnalysis(taskId);
  return apiFetch<TaskStatus>(`/analysis/event/${taskId}`);
}
