import type { UnitStage } from '@/api/ingest';

export const STAGE_LABEL: Record<UnitStage, string> = {
  s1a: '呼叫 A · 敘事核心（core_extraction）',
  s1b: '呼叫 B · 敘述與訊號（signal_tagging）',
  s4a: 'S4 · 資訊控制深度抽取',
};
