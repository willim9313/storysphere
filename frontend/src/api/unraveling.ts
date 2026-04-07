import { apiFetch } from './client';

export type NodeStatus = 'complete' | 'partial' | 'empty';

export interface UnravelingNode {
  nodeId: string;
  layer: number;
  label: string;
  status: NodeStatus;
  counts: Record<string, number>;
  meta: Record<string, string | number | boolean>;
}

export interface UnravelingEdge {
  source: string;
  target: string;
}

export interface UnravelingManifest {
  bookId: string;
  nodes: UnravelingNode[];
  edges: UnravelingEdge[];
}

export function fetchUnraveling(bookId: string): Promise<UnravelingManifest> {
  return apiFetch<UnravelingManifest>(`/books/${bookId}/unraveling`);
}
