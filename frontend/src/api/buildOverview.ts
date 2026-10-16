import { apiFetch } from './client';
import type { components } from './generated';

// #19 — generated from the backend models; the page's names are aliases.
export type BuildOverviewNode = components['schemas']['NodeData'];
export type BuildOverviewEdge = components['schemas']['EdgeData'];
export type BuildOverviewManifest = components['schemas']['UnravelingManifest'];
export type NodeStatus = BuildOverviewNode['status'];

export type ChapterDistribution = components['schemas']['ChapterDistribution'];
export type RunningUnraveling = components['schemas']['RunningUnravelingResponse'];

export function fetchBuildOverview(bookId: string): Promise<BuildOverviewManifest> {
  return apiFetch<BuildOverviewManifest>(`/books/${bookId}/unraveling`);
}

export function fetchChapterDistribution(bookId: string): Promise<ChapterDistribution> {
  return apiFetch<ChapterDistribution>(`/books/${bookId}/unraveling/chapter-distribution`);
}

/** #19c — the rerun / concept inference going for this book, if any. */
export function fetchRunningUnraveling(bookId: string): Promise<RunningUnraveling> {
  return apiFetch<RunningUnraveling>(`/books/${bookId}/unraveling/running`);
}
