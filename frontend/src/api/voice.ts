import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiDelete } from './client';
import type { components } from './generated';

export type VoiceProfile = components['schemas']['VoiceProfileResponse'];

export function fetchVoiceProfile(bookId: string, entityId: string): Promise<VoiceProfile> {
  return apiFetch<VoiceProfile>(`/books/${bookId}/entities/${entityId}/voice`);
}

export function deleteVoiceProfile(bookId: string, entityId: string): Promise<void> {
  return apiDelete(`/books/${bookId}/entities/${entityId}/voice`);
}

export function useVoiceProfile(
  bookId: string | null | undefined,
  entityId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['books', bookId, 'entities', entityId, 'voice'] as const,
    queryFn: () => fetchVoiceProfile(bookId!, entityId!),
    enabled: enabled && !!bookId && !!entityId,
    retry: false,
  });
}
