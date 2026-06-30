// Hero's Journey — structural constants + three-state visual language.
// Theory text (name / description / narrative function) is sourced from
// frameworksData (localized); only the framework-fixed structure lives here.
import type { TFunction } from 'i18next';
import { getFrameworks } from '@/data/frameworksData';
import type { HeroJourneyStage } from '@/api/narrative';

export type Phase = 'departure' | 'initiation' | 'return';
export type StageState = 'filled' | 'low' | 'absent';

export const PHASES: Phase[] = ['departure', 'initiation', 'return'];

export type LayoutId = 'track' | 'columns' | 'ring' | 'band';
export const LAYOUT_IDS: LayoutId[] = ['track', 'columns', 'ring', 'band'];

// Localized chapter-range label, e.g. "第 18–20 章" / "Ch. 18–20".
export function formatChapters(range: number[] | undefined, t: TFunction): string {
  if (!range || range.length === 0) return t('narrative.noChapters');
  const a = range[0];
  const b = range[range.length - 1];
  return t('narrative.chapterLabel', { range: a === b ? `${a}` : `${a}–${b}` });
}

// Vogler's 12 stages, in canonical order.
export const STAGE_ORDER: string[] = [
  'ordinary_world',
  'call_to_adventure',
  'refusal_of_call',
  'meeting_the_mentor',
  'crossing_threshold',
  'tests_allies_enemies',
  'approach_innermost_cave',
  'ordeal',
  'reward',
  'road_back',
  'resurrection',
  'return_with_elixir',
];

export const STAGE_PHASE: Record<string, Phase> = {
  ordinary_world: 'departure',
  call_to_adventure: 'departure',
  refusal_of_call: 'departure',
  meeting_the_mentor: 'departure',
  crossing_threshold: 'departure',
  tests_allies_enemies: 'initiation',
  approach_innermost_cave: 'initiation',
  ordeal: 'initiation',
  reward: 'initiation',
  road_back: 'return',
  resurrection: 'return',
  return_with_elixir: 'return',
};

export function stageOrdinal(stageId: string): number {
  return STAGE_ORDER.indexOf(stageId) + 1;
}

export function stagePhase(stageId: string): Phase {
  return STAGE_PHASE[stageId] ?? 'departure';
}

export function groupByPhase(stages: HeroJourneyStage[]): Record<Phase, HeroJourneyStage[]> {
  const groups: Record<Phase, HeroJourneyStage[]> = { departure: [], initiation: [], return: [] };
  for (const s of stages) groups[stagePhase(s.stage_id)].push(s);
  return groups;
}

// Order an arbitrary stage list by the canonical sequence.
export function sortStages(stages: HeroJourneyStage[]): HeroJourneyStage[] {
  return [...stages].sort((a, b) => stageOrdinal(a.stage_id) - stageOrdinal(b.stage_id));
}

// ── Three-state visual language ────────────────────────────────────
// filled (conf ≥ 0.6) · low (0 < conf < 0.6) · absent (empty chapter_range)

export function stageState(stage: HeroJourneyStage | undefined): StageState {
  if (!stage || !stage.chapter_range || stage.chapter_range.length === 0) return 'absent';
  if (stage.confidence < 0.6) return 'low';
  return 'filled';
}

// Confidence → accent fill intensity (%). Higher confidence = deeper fill.
export function fillPct(confidence: number): number {
  return Math.round(20 + confidence * 44);
}

export function discFill(stage: HeroJourneyStage): string {
  if (stageState(stage) === 'absent') return 'transparent';
  return `color-mix(in oklab, var(--accent) ${fillPct(stage.confidence)}%, var(--bg-primary))`;
}

export function discText(stage: HeroJourneyStage): string {
  if (stageState(stage) === 'absent') return 'var(--fg-muted)';
  return fillPct(stage.confidence) >= 48 ? 'var(--bg-primary)' : 'var(--fg-primary)';
}

export function phaseWash(phase: Phase, strong: boolean): string {
  const pct =
    phase === 'departure'
      ? strong
        ? 10
        : 5
      : phase === 'initiation'
        ? strong
          ? 16
          : 9
        : strong
          ? 12
          : 6;
  return `color-mix(in oklab, var(--accent) ${pct}%, var(--bg-primary))`;
}

// ── Stage theory lookup (from frameworksData, localized) ───────────

export interface StageTheory {
  name: string;
  description: string;
  narrativeFunction: string;
}

export function getStageTheory(lang: string): Record<string, StageTheory> {
  const hj = getFrameworks(lang).find((f) => f.key === 'hero_journey');
  const out: Record<string, StageTheory> = {};
  if (!hj) return out;
  for (const item of hj.items) {
    out[item.id] = {
      name: item.name,
      description: item.details[0]?.value ?? '',
      narrativeFunction: item.details[1]?.value ?? '',
    };
  }
  return out;
}
