/* API types — aligned with API_CONTRACT.md
 *
 * CLAUDE.md 的規則是「API response type 一律從 generated.ts 取用」。凡是後端
 * 已有對應 schema 的，這裡都寫成 re-export alias（見下方 `components['schemas'][…]`
 * 那幾行），呼叫端不必改，但欄位定義以後端為準。
 *
 * GraphNode / Segment / EntityChunkItem / EntityChunksResponse 曾卡在「後端的
 * type 欄位是純 `str`」，已於 B-084 從後端收窄成 EntityType；Book / BookDetail
 * 卡在同一類問題的 `BookResponse.status`，已於 B-088 由 pipeline_status 推導。
 * 六個都已改回 generated alias，這裡不再有手寫的 response 型別。
 */

// ── Entity type ─────────────────────────────────────────────────

/** 後端 `EntityType` enum 的 6 個值，加上圖譜獨有的 'event'（事件節點不是實體，
 *  domain enum 裡沒有它）。從 GraphNode 推導而非手寫，兩邊就不會再各自漂移。 */
export type EntityType = components['schemas']['GraphNode']['type'];

// ── Books ───────────────────────────────────────────────────────

/** 書卡徽章。`processing` 不是書的狀態：還在跑 ingestion 的書不會出現在 #1 的
 *  回應裡，前端另外用 ProcessingBookCard 畫（見 LibraryPage）。 */
export type BookStatus = components['schemas']['BookResponse']['status'];
export type StepStatus = components['schemas']['StepStatus'];

export type PipelineStatus = components['schemas']['PipelineStatusResponse'];

export type Book = components['schemas']['BookResponse'];

export type BookDetail = components['schemas']['BookDetailResponse'];

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
  keywords?: Record<string, number>;
}

// ── Chunks & Segments ───────────────────────────────────────────

export type Segment = components['schemas']['Segment'];

export interface Chunk {
  id: string;
  chapterId: string;
  order: number;
  content: string;
  keywords: string[];
  segments: Segment[];
}

// ── Entity Chunks ──────────────────────────────────────────────

export type EntityChunkItem = components['schemas']['EntityChunkItem'];

export type EntityChunksResponse = components['schemas']['EntityChunksResponse'];

// ── Graph ───────────────────────────────────────────────────────

export type GraphNode = components['schemas']['GraphNode'];

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

export type GraphEdge = components['schemas']['GraphEdge'];


export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Analysis ────────────────────────────────────────────────────

// Sourced from generated.ts (backend Pydantic schema) rather than hand-written —
// both now carry mentionCount; see docs/type-generation.md.
export type AnalysisItem = components['schemas']['AnalysisItem'];
export type UnanalyzedEntity = components['schemas']['UnanalyzedEntity'];

export type AnalysisListResponse = components['schemas']['AnalysisListResponse'];

export interface CepData {
  actions: string[];
  traits: string[];
  relations: Array<{ target: string; type: string; description: string }>;
  keyEvents: Array<Record<string, unknown>>;
  quotes: string[];
  topTerms: Record<string, number>;
}

export interface ArchetypeDetail {
  framework: string;
  primary: string;
  secondary: string | null;
  confidence: number;
  evidence: string[];
}

export interface ArcSegment {
  chapterRange: string;
  phase: string;
  description: string;
}

export interface CharacterAnalysisDetail {
  entityId: string;
  entityName: string;
  profileSummary: string;
  archetypes: ArchetypeDetail[];
  cep: CepData | null;
  arc: ArcSegment[];
  status?: 'complete' | 'partial';
  failedParts?: string[];
  generatedAt: string;
}

// ── Tasks ───────────────────────────────────────────────────────

import type { components } from './generated';

export type MurmurEvent = components['schemas']['MurmurEvent'];
export type MurmurEventType = MurmurEvent['type'];

export interface ReviewParagraph {
  paragraphIndex: number;
  text: string;
  role: string;
  titleSpan: [number, number] | null;
  sentences: string[];
}

export interface ReviewChapter {
  chapterIdx: number;
  title: string | null;
  role: string;
  paragraphs: ReviewParagraph[];
}

export interface ReviewData {
  chapters: ReviewChapter[];
}

export interface ReviewSubmitChapter {
  title: string;
  role: string;
  startParagraphIndex: number;
}

export type TaskStatus = components['schemas']['TaskStatus'];

/** Result shape for batch event analysis tasks */
export interface BatchEepResult {
  progress: number;
  total: number;
  failed: number;
  skipped: number;
}

// ── Timeline ───────────────────────────────────────────────────

export type NarrativeMode = 'present' | 'flashback' | 'flashforward' | 'parallel' | 'unknown';
export type EventImportance = 'KERNEL' | 'SATELLITE';
export type TimelineOrder = 'narrative' | 'chronological' | 'matrix';

export interface TimelineEvent {
  id: string;
  title: string;
  eventType: string;
  description: string;
  chapter: number;
  chapterTitle?: string;
  chronologicalRank: number | null;
  narrativeMode: NarrativeMode;
  eventImportance: EventImportance | null;
  /** True when an EEP analysis result is cached for this event (#13a). */
  hasAnalysis: boolean;
  temporalDisplacement?: TemporalDisplacement | null;
  storyTimeHint?: string;
  participants: { id: string; name: string; type: EntityType }[];
  location?: { id: string; name: string };
}

export interface TemporalRelation {
  source: string;
  target: string;
  type: string;
  confidence: number;
}

export type TimelineQuality = components['schemas']['TimelineQuality'];

/** Per-event verdict from the #21h temporal analysis — null until that run has
 *  happened with sufficient coverage. Sourced from generated.ts, not
 *  hand-written; see docs/type-generation.md. */
export type TemporalDisplacement = components['schemas']['TemporalDisplacementEntry'];

export interface TimelineData {
  events: TimelineEvent[];
  temporalRelations: TemporalRelation[];
  quality: TimelineQuality;
  /** True when a temporal analysis with sufficient coverage is cached. */
  temporalAnalyzed: boolean;
  /** linear | partially_linear | non_linear | unknown; null when never run. */
  temporalStructure?: string | null;
  /** True when a pipeline step re-ran after the temporal analysis was cached. */
  temporalIsStale?: boolean;
  /** Pipeline step whose rerun overtook the cached temporal analysis. */
  temporalStaleReason?: string | null;
}

// ── Tension Analysis ────────────────────────────────────────────

export interface TensionPole {
  concept_name: string;
  concept_id?: string;
  carrier_ids: string[];
  carrier_names: string[];
  stance?: string;
}

export interface TEU {
  id: string;
  event_id: string;
  document_id: string;
  chapter: number;
  pole_a: TensionPole;
  pole_b: TensionPole;
  tension_description: string;
  intensity: number;
  evidence: string[];
  thematic_note?: string;
  assembled_by: string;
  assembled_at: string;
  review_status: 'pending' | 'approved' | 'rejected';
}

export type Carrier = components['schemas']['Carrier'];

export type TEUSummary = components['schemas']['TEUSummary'];

export interface TensionLine {
  id: string;
  document_id: string;
  teu_ids: string[];
  canonical_pole_a: string;
  canonical_pole_b: string;
  intensity_summary: number;
  chapter_range: number[];
  thematic_note?: string | null;
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
  teus?: TEUSummary[];
}

export interface TensionTheme {
  id: string;
  document_id: string;
  tension_line_ids: string[];
  proposition: string;
  frye_mythos?: string;
  booker_plot?: string;
  assembled_by: string;
  assembled_at: string;
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
  /** True when the theme no longer reflects the current TensionLines. */
  is_stale?: boolean;
  stale_reason?: StaleReason | null;
}

export type StaleReason = 'no_lines' | 'lines_regrouped' | 'review_changed';

// ── Event Analysis Detail (EEP) ────────────────────────────────

export interface ParticipantRole {
  entityId: string;
  entityName: string;
  role: string;
  impactDescription: string;
}

export interface EventEvidenceProfile {
  stateBefore: string;
  stateAfter: string;
  causalFactors: string[];
  priorEventIds: string[];
  subsequentEventIds: string[];
  participantRoles: ParticipantRole[];
  consequences: string[];
  structuralRole: string;
  eventImportance: string;
  thematicSignificance: string;
  textEvidence: string[];
  keyQuotes: string[];
  topTerms: Record<string, number>;
}

export interface CausalityAnalysis {
  rootCause: string;
  causalChain: string[];
  triggerEventIds: string[];
  chainSummary: string;
}

export interface ImpactAnalysis {
  affectedParticipantIds: string[];
  participantImpacts: string[];
  relationChanges: string[];
  subsequentEventIds: string[];
  impactSummary: string;
}

export type EventSourceResponse = components['schemas']['EventSourceResponse'];
export type EventSourcePassage = components['schemas']['EventSourcePassage'];

export interface EventAnalysisDetail {
  eventId: string;
  title: string;
  eep: EventEvidenceProfile;
  causality: CausalityAnalysis;
  impact: ImpactAnalysis;
  summary: { summary: string };
  analyzedAt: string;
  status?: 'complete' | 'partial';
  failedParts?: string[];
  chapter?: number | null;
  chunk?: number | null;
  narrativeMode?: string | null;
}
