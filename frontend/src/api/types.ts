/* API types — aligned with API_CONTRACT.md
 *
 * CLAUDE.md 的規則是「API response type 一律從 generated.ts 取用」。凡是後端
 * 已有對應 schema 的，這裡都寫成 re-export alias（見下方 `components['schemas'][…]`
 * 那幾行），呼叫端不必改，但欄位定義以後端為準。
 *
 * 刻意留在手寫的：Book / BookDetail —— 後端 `BookResponse.status` 宣告成純
 * `str`，而前端這裡窄化成 BookStatus union，`StatusBadge.tsx` 的
 * `Record<BookStatus, …>` 靠這個窄化。接回 generated 等於把窄化丟掉再補 cast。
 * 後端實際只吐 `"ready"`，前端卻預期 4 種狀態——那不是型別問題，要先決定那 4 種
 * 是未實作的設計還是已廢棄的舊設計。見 BACKLOG 的 B-088。
 *
 * GraphNode / Segment / EntityChunkItem / EntityChunksResponse 原本也卡在同一
 * 類問題（後端的 type 欄位是純 `str`），已於 B-084 從後端收窄成 EntityType，
 * 這四個因此都改回 generated alias。
 */

// ── Entity type ─────────────────────────────────────────────────

/** 後端 `EntityType` enum 的 6 個值，加上圖譜獨有的 'event'（事件節點不是實體，
 *  domain enum 裡沒有它）。從 GraphNode 推導而非手寫，兩邊就不會再各自漂移。 */
export type EntityType = components['schemas']['GraphNode']['type'];

// ── Books ───────────────────────────────────────────────────────

export type BookStatus = 'processing' | 'ready' | 'analyzed' | 'error';
export type StepStatus = 'pending' | 'done' | 'failed';

export interface PipelineStatus {
  summarization: StepStatus;
  featureExtraction: StepStatus;
  knowledgeGraph: StepStatus;
  symbolDiscovery: StepStatus;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  status: BookStatus;
  chapterCount: number;
  entityCount?: number;
  uploadedAt: string;
  lastOpenedAt?: string;
  pipelineStatus: PipelineStatus;
}

export interface RerunTaskResult {
  taskId: string;
}

export interface BookDetail extends Book {
  /** 書籍本身的語言（非 UI 語言），如 'zh-tw' / 'en'。分析類 endpoint 的
   *  language 參數應取自這裡：後端以 get_language_display_name() 轉成 prompt 的
   *  "Respond in {name}."，'zh' 只得到 "Chinese"，'zh-tw' 才是 "Traditional
   *  Chinese"。見 API_CONTRACT #3。 */
  language: string;
  summary?: string;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
  eventCount: number;
  entityStats: {
    character: number;
    location: number;
    organization: number;
    object: number;
    concept: number;
    other: number;
  };
  keywords?: Record<string, number>;
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

export interface EntityAnalysis {
  entityId: string;
  entityName: string;
  content: string;
  generatedAt: string;
}

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
export type MurmurStepKey = MurmurEvent['stepKey'];
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
