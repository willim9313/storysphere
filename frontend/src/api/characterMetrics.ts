import type { components } from './generated';
import { apiFetch } from './client';

// #6e — character centrality (pagerank + degree), synchronous, no polling.
// Used by the character analysis landing quadrant view (Y axis + bubble radius).
export type CharacterMetricsResponse = components['schemas']['CharacterMetricsResponse'];
export type CharacterMetricResponse = components['schemas']['CharacterMetricResponse'];

export function fetchCharacterMetrics(bookId: string): Promise<CharacterMetricsResponse> {
  return apiFetch<CharacterMetricsResponse>(`/books/${bookId}/analysis/character-metrics`);
}
