import { apiFetch } from './client';
import type {
  CharacterAnalysisRequest,
  EventAnalysisRequest,
  TaskStatus,
} from './types';

export function triggerCharacterAnalysis(
  req: CharacterAnalysisRequest,
): Promise<TaskStatus> {
  return apiFetch<TaskStatus>('/analysis/character', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function pollCharacterAnalysis(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/analysis/character/${taskId}`);
}

export function triggerEventAnalysis(
  req: EventAnalysisRequest,
): Promise<TaskStatus> {
  return apiFetch<TaskStatus>('/analysis/event', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function pollEventAnalysis(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/analysis/event/${taskId}`);
}
