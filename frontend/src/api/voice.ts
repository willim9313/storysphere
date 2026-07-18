import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiDelete } from './client';
import type { components } from './generated';

export type VoiceProfile = components['schemas']['VoiceProfileResponse'];

/**
 * #16a `cached_only=true` reads the cache without triggering lazy generation.
 * Omit (or pass false) for the normal lazy-generate-on-miss GET.
 */
export function fetchVoiceProfile(
  bookId: string,
  entityId: string,
  cachedOnly = false,
): Promise<VoiceProfile> {
  const qs = cachedOnly ? '?cached_only=true' : '';
  return apiFetch<VoiceProfile>(`/books/${bookId}/entities/${entityId}/voice${qs}`);
}

export function deleteVoiceProfile(bookId: string, entityId: string): Promise<void> {
  return apiDelete(`/books/${bookId}/entities/${entityId}/voice`);
}

/**
 * #8: server-judged generation status — probes the cache (cached_only=true)
 * instead of the removed `voice_generated:*` localStorage gate. A 404 here is
 * the expected "not generated yet" state, not a failure, so retry is off.
 */
export function useCachedVoiceProfile(
  bookId: string | null | undefined,
  entityId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['books', bookId, 'entities', entityId, 'voice'] as const,
    queryFn: () => fetchVoiceProfile(bookId!, entityId!, true),
    enabled: !!bookId && !!entityId,
    retry: false,
  });
}
