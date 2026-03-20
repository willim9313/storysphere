/* API types — aligned with API_CONTRACT.md */

// ── Entity type ─────────────────────────────────────────────────

export type EntityType = 'character' | 'location' | 'concept' | 'event';

// ── Books ───────────────────────────────────────────────────────

export type BookStatus = 'processing' | 'ready' | 'analyzed' | 'error';

export interface Book {
  id: string;
  title: string;
  author?: string;
  status: BookStatus;
  chapterCount: number;
  entityCount?: number;
  uploadedAt: string;
  lastOpenedAt?: string;
}

export interface BookDetail extends Book {
  summary?: string;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
  entityStats: {
    character: number;
    location: number;
    concept: number;
    event: number;
  };
}

// ── Chapters ────────────────────────────────────────────────────

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  order: number;
  chunkCount: number;
  entityCount: number;
  summary?: string;
  topEntities?: {
    id: string;
    name: string;
    type: EntityType;
  }[];
}

// ── Chunks & Segments ───────────────────────────────────────────

export interface Segment {
  text: string;
  entity?: {
    type: EntityType;
    entityId: string;
    name: string;
  };
}

export interface Chunk {
  id: string;
  chapterId: string;
  order: number;
  content: string;
  keywords: string[];
  segments: Segment[];
}

// ── Entity Chunks ──────────────────────────────────────────────

export interface EntityChunkItem {
  id: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber: number;
  order: number;
  content: string;
  segments: Segment[];
}

export interface EntityChunksResponse {
  entityId: string;
  entityName: string;
  total: number;
  chunks: EntityChunkItem[];
}

// ── Graph ───────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  type: EntityType;
  description?: string;
  chunkCount: number;
  eventType?: string;
  chapter?: number;
}

export interface EventDetail {
  id: string;
  title: string;
  eventType: string;
  description: string;
  chapter: number;
  significance?: string;
  consequences: string[];
  participants: { id: string; name: string; type: EntityType }[];
  location?: { id: string; name: string };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Analysis ────────────────────────────────────────────────────

export interface AnalysisItem {
  id: string;
  entityId: string;
  section: 'characters' | 'events';
  title: string;
  archetypeType?: string;
  chapterCount: number;
  content: string;
  framework: 'jung' | 'schmidt';
  generatedAt: string;
}

export interface UnanalyzedEntity {
  id: string;
  name: string;
  type: EntityType;
  chapterCount: number;
}

export interface AnalysisListResponse {
  analyzed: AnalysisItem[];
  unanalyzed: UnanalyzedEntity[];
}

export interface EntityAnalysis {
  entityId: string;
  entityName: string;
  content: string;
  generatedAt: string;
}

// ── Tasks ───────────────────────────────────────────────────────

export interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  stage: string;
  result?: {
    bookId?: string;
    [key: string]: unknown;
  };
  error?: string;
}
