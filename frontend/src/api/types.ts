/* API types — aligned with API_CONTRACT.md */

// ── Entity type ─────────────────────────────────────────────────

export type EntityType = 'character' | 'location' | 'organization' | 'object' | 'concept' | 'other' | 'event';

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
  summary?: string;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
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
  // F-01 inferred relation fields
  inferred?: boolean;
  confidence?: number;
  inferredId?: string;
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
  archetypes: Record<string, string>;
  chapterCount: number;
  content: string;
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
  paragraphs: ReviewParagraph[];
}

export interface ReviewData {
  chapters: ReviewChapter[];
}

export interface ReviewSubmitChapter {
  title: string;
  startParagraphIndex: number;
}

export interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'awaiting_review';
  progress: number;
  stage: string;
  subProgress?: number;
  subTotal?: number;
  subStage?: string;
  result?: {
    bookId?: string;
    [key: string]: unknown;
  };
  error?: string;
  murmurEvents?: MurmurEvent[];
}

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

export interface TimelineQuality {
  eepCoverage: number;
  analyzedCount: number;
  totalCount: number;
  hasChronologicalRanks: boolean;
}

export interface TimelineData {
  events: TimelineEvent[];
  temporalRelations: TemporalRelation[];
  quality: TimelineQuality;
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

export interface TensionLine {
  id: string;
  document_id: string;
  teu_ids: string[];
  canonical_pole_a: string;
  canonical_pole_b: string;
  intensity_summary: number;
  chapter_range: number[];
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
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
}

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

export interface EventAnalysisDetail {
  eventId: string;
  title: string;
  eep: EventEvidenceProfile;
  causality: CausalityAnalysis;
  impact: ImpactAnalysis;
  summary: { summary: string };
  analyzedAt: string;
}
