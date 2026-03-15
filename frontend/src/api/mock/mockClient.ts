/**
 * Mock API client — intercepts all API calls and returns fake data.
 * Enable by setting VITE_MOCK=true in .env or .env.local
 */

import type {
  DocumentSummary,
  DocumentResponse,
  ParagraphResponse,
  EntityListResponse,
  EntityResponse,
  RelationResponse,
  TimelineEntry,
  SubgraphResponse,
  SearchResult,
  TaskStatus,
} from '../types';

import {
  mockDocuments,
  mockDocument,
  getMockParagraphs,
  mockEntities,
  mockRelations,
  mockTimelines,
  mockSubgraph,
  mockCharacterAnalysisResult,
  mockEventAnalysisResult,
  createMockTask,
  pollMockTask,
} from './data';

// Simulate network latency
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms + Math.random() * 200));

// ── Documents ───────────────────────────────────────────────────

export async function fetchDocuments(): Promise<DocumentSummary[]> {
  await delay();
  return mockDocuments;
}

export async function fetchDocument(id: string): Promise<DocumentResponse> {
  await delay();
  if (id === 'doc-001') return mockDocument;
  // Return the same doc with overridden id/title for any id
  return { ...mockDocument, id };
}

// ── Paragraphs ──────────────────────────────────────────────────

export async function fetchParagraphs(
  _documentId: string,
  chapterNumber: number,
): Promise<ParagraphResponse[]> {
  await delay(200);
  return getMockParagraphs(chapterNumber);
}

// ── Entities ────────────────────────────────────────────────────

export async function fetchEntities(params?: {
  entity_type?: string;
  limit?: number;
  offset?: number;
}): Promise<EntityListResponse> {
  await delay();
  let items = mockEntities;
  if (params?.entity_type) {
    items = items.filter((e) => e.entity_type === params.entity_type);
  }
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 500;
  const sliced = items.slice(offset, offset + limit);
  return { items: sliced, total: items.length };
}

export async function fetchEntity(id: string): Promise<EntityResponse> {
  await delay(150);
  const entity = mockEntities.find((e) => e.id === id);
  if (!entity) throw new Error(`Entity ${id} not found`);
  return entity;
}

export async function fetchEntityRelations(id: string): Promise<RelationResponse[]> {
  await delay(150);
  return mockRelations[id] ?? [];
}

export async function fetchEntityTimeline(id: string): Promise<TimelineEntry[]> {
  await delay(150);
  return mockTimelines[id] ?? [];
}

export async function fetchEntitySubgraph(
  _id: string,
  _kHops = 2,
): Promise<SubgraphResponse> {
  await delay(200);
  return mockSubgraph;
}

// ── Ingest ──────────────────────────────────────────────────────

const ingestTasks = new Map<string, number>();

export async function uploadDocument(
  _file: File,
  _title: string,
): Promise<TaskStatus> {
  await delay(500);
  const task = createMockTask();
  ingestTasks.set(task.task_id, 0);
  return task;
}

export async function fetchIngestStatus(taskId: string): Promise<TaskStatus> {
  await delay(300);
  return pollMockTask(taskId, {
    document_id: 'doc-001',
    document_title: 'Pride and Prejudice',
    chapters: 5,
    entities: 12,
    relations: 14,
  });
}

// ── Analysis ────────────────────────────────────────────────────

const analysisTasks = new Map<string, { type: 'character' | 'event' }>();

export async function triggerCharacterAnalysis(): Promise<TaskStatus> {
  await delay(300);
  const task = createMockTask();
  analysisTasks.set(task.task_id, { type: 'character' });
  return task;
}

export async function pollCharacterAnalysis(taskId: string): Promise<TaskStatus> {
  await delay(300);
  return pollMockTask(taskId, mockCharacterAnalysisResult);
}

export async function triggerEventAnalysis(): Promise<TaskStatus> {
  await delay(300);
  const task = createMockTask();
  analysisTasks.set(task.task_id, { type: 'event' });
  return task;
}

export async function pollEventAnalysis(taskId: string): Promise<TaskStatus> {
  await delay(300);
  return pollMockTask(taskId, mockEventAnalysisResult);
}

// ── Search ──────────────────────────────────────────────────────

export async function semanticSearch(
  q: string,
  limit = 10,
  _documentId?: string,
): Promise<SearchResult[]> {
  await delay(200);
  const lower = q.toLowerCase();
  const matching = mockEntities
    .filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        (e.description?.toLowerCase().includes(lower) ?? false),
    )
    .slice(0, limit);

  return matching.map((e, i) => ({
    id: e.id,
    text: e.description ?? e.name,
    score: 0.95 - i * 0.05,
    metadata: { entity_name: e.name, entity_type: e.entity_type },
  }));
}
