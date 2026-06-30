import { apiFetch } from './client';
import type { components } from './generated';

export type SettingsInfo = components['schemas']['SettingsInfoResponse'];

export function fetchSettingsInfo(): Promise<SettingsInfo> {
  return apiFetch<SettingsInfo>('/settings/info');
}
