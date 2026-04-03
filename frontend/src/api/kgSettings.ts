import { apiFetch } from './client';
import type { TaskStatus } from './types';
import type { components } from './generated';

export type KgStatus = components['schemas']['KgStatusResponse'];
export type KgSwitchResponse = components['schemas']['KgSwitchResponse'];

export type MigrationDirection = 'nx_to_neo4j' | 'neo4j_to_nx';

export function fetchKgStatus(): Promise<KgStatus> {
  return apiFetch<KgStatus>('/kg/status');
}

export function switchKgMode(mode: 'networkx' | 'neo4j'): Promise<KgSwitchResponse> {
  return apiFetch<KgSwitchResponse>('/kg/switch', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export function startMigration(direction: MigrationDirection): Promise<TaskStatus> {
  return apiFetch<TaskStatus>('/kg/migrate', {
    method: 'POST',
    body: JSON.stringify({ direction }),
  });
}

export function fetchMigrationStatus(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/kg/migrate/${taskId}`);
}
