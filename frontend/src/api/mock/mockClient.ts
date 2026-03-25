/**
 * Mock API client — intercepts all API calls and returns fake data.
 * Enable by setting VITE_MOCK=true in .env or .env.local
 */

import type {
  Book,
  BookDetail,
  Chapter,
  Chunk,
  EntityChunksResponse,
  GraphData,
  TaskStatus,
  AnalysisListResponse,
  EntityAnalysis,
} from '../types';

import {
  mockBooks,
  mockBookDetail,
  mockChapters,
  getMockChunks,
  mockGraphData,
  mockCharacterAnalyses,
  mockEventAnalyses,
  mockEntityAnalysisMap,
  createMockTask,
  advanceMockTask,
} from './data';

// Simulate network latency
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms + Math.random() * 200));

// ── Books (#1, #2-a, #2-b) ─────────────────────────────────────

export async function fetchBooks(): Promise<Book[]> {
  await delay();
  return mockBooks;
}

export async function fetchBook(bookId: string): Promise<BookDetail> {
  await delay();
  if (bookId === 'book-001') return mockBookDetail;
  return { ...mockBookDetail, id: bookId, title: `Book ${bookId}` };
}

export async function deleteBook(_bookId: string): Promise<void> {
  await delay(200);
}

// ── Chapters (#4) ──────────────────────────────────────────────

export async function fetchChapters(_bookId: string): Promise<Chapter[]> {
  await delay();
  return mockChapters;
}

// ── Chunks (#5) ────────────────────────────────────────────────

export async function fetchChunks(
  _bookId: string,
  chapterId: string,
): Promise<Chunk[]> {
  await delay(200);
  return getMockChunks(chapterId);
}

// ── Entity Chunks (#9b) ───────────────────────────────────────

export async function fetchEntityChunks(
  _bookId: string,
  entityId: string,
): Promise<EntityChunksResponse> {
  await delay(200);
  return { entityId, entityName: 'Mock Entity', total: 0, chunks: [] };
}

// ── Graph (#9) ─────────────────────────────────────────────────

export async function fetchGraphData(_bookId: string): Promise<GraphData> {
  await delay(200);
  return mockGraphData;
}

// ── Ingest (#2) ────────────────────────────────────────────────

export async function uploadBook(_file: File): Promise<{ taskId: string }> {
  await delay(500);
  return createMockTask();
}

// ── Task polling (#8) ──────────────────────────────────────────

export async function fetchTaskStatus(taskId: string): Promise<TaskStatus> {
  await delay(300);
  return advanceMockTask(taskId);
}

// ── Analysis (#6, #6a, #6b, #6c, #7a, #7b, #7c) ───────────────

export async function triggerBookAnalysis(_bookId: string): Promise<{ taskId: string }> {
  await delay(300);
  return createMockTask();
}

export async function fetchCharacterAnalyses(_bookId: string): Promise<AnalysisListResponse> {
  await delay();
  return mockCharacterAnalyses;
}

export async function fetchEventAnalyses(_bookId: string): Promise<AnalysisListResponse> {
  await delay();
  return mockEventAnalyses;
}

export async function regenerateAnalysis(
  _bookId: string,
  _section: string,
  _itemId: string,
): Promise<{ taskId: string }> {
  await delay(300);
  return createMockTask();
}

export async function fetchEntityAnalysis(
  _bookId: string,
  entityId: string,
): Promise<EntityAnalysis> {
  await delay();
  const analysis = mockEntityAnalysisMap[entityId];
  if (!analysis) {
    throw new Error('NOT_FOUND');
  }
  return analysis;
}

export async function triggerEntityAnalysis(
  _bookId: string,
  _entityId: string,
): Promise<{ taskId: string }> {
  await delay(300);
  return createMockTask();
}

export async function deleteEntityAnalysis(
  _bookId: string,
  _entityId: string,
): Promise<void> {
  await delay(200);
}

export async function triggerBatchEventAnalysis(
  _bookId: string,
): Promise<{ taskId: string }> {
  await delay(300);
  return createMockTask();
}
