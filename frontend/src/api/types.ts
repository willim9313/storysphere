/* Backend-mirrored TypeScript types */

// ── Common ──────────────────────────────────────────────────────

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result: unknown;
  error: string | null;
}

// ── Documents ───────────────────────────────────────────────────

export interface DocumentSummary {
  id: string;
  title: string;
  file_type: string;
}

export interface ChapterResponse {
  id: string;
  number: number;
  title: string | null;
  summary: string | null;
  word_count: number;
  paragraph_count: number;
}

export interface DocumentResponse {
  id: string;
  title: string;
  author: string | null;
  file_type: string;
  summary: string | null;
  total_chapters: number;
  total_paragraphs: number;
  chapters: ChapterResponse[];
}

export interface ParagraphResponse {
  id: string;
  text: string;
  chapter_number: number;
  position: number;
  keywords: Record<string, number> | null;
}

// ── Entities ────────────────────────────────────────────────────

export type EntityType =
  | 'character'
  | 'location'
  | 'object'
  | 'event'
  | 'concept'
  | 'organization';

export interface EntityResponse {
  id: string;
  name: string;
  entity_type: EntityType;
  aliases: string[];
  attributes: Record<string, unknown>;
  description: string | null;
  first_appearance_chapter: number | null;
  mention_count: number;
}

export interface EntityListResponse {
  items: EntityResponse[];
  total: number;
}

export interface RelationResponse {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  description: string | null;
  weight: number;
  chapters: number[];
  is_bidirectional: boolean;
}

export interface TimelineEntry {
  event_id: string;
  title: string;
  chapter: number | null;
  description: string | null;
}

export interface SubgraphResponse {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
}

// ── Search ──────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

// ── Analysis ────────────────────────────────────────────────────

export interface CharacterAnalysisRequest {
  entity_name: string;
  document_id: string;
  archetype_frameworks?: string[];
  language?: string;
  force_refresh?: boolean;
}

export interface EventAnalysisRequest {
  event_id: string;
  document_id: string;
  language?: string;
  force_refresh?: boolean;
}
