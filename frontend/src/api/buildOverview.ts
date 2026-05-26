import { apiFetch } from './client';
import type { components } from './generated';

export type NodeStatus = 'complete' | 'partial' | 'empty';

export interface BuildOverviewNode {
  nodeId: string;
  layer: number;
  label: string;
  status: NodeStatus;
  counts: Record<string, number>;
  meta: Record<string, string | number | boolean>;
  parentId?: string;
}

export interface BuildOverviewEdge {
  source: string;
  target: string;
}

export interface BuildOverviewManifest {
  bookId: string;
  nodes: BuildOverviewNode[];
  edges: BuildOverviewEdge[];
}

export type ChapterDistribution = components['schemas']['ChapterDistribution'];

export function fetchBuildOverview(bookId: string): Promise<BuildOverviewManifest> {
  return apiFetch<BuildOverviewManifest>(`/books/${bookId}/unraveling`);
}

export function fetchChapterDistribution(bookId: string): Promise<ChapterDistribution> {
  return apiFetch<ChapterDistribution>(`/books/${bookId}/unraveling/chapter-distribution`);
}
