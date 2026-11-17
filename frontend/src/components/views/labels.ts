// 證據類型的中文名（01 §5–§7）；沒列到的照原樣顯示。
const CLAIM_TYPES: Record<string, string> = {
  character: '角色',
  event: '事件',
  relation: '關係',
  utterance: '話語',
  imagery_motif: '意象',
  setting_hint: '設定提示',
  causal_link: '因果連結',
  event_role: '事件角色（核心／衛星）',
  arc_segment: '弧線段',
  relation_network: '角色網路',
  belief_state: '知情狀態',
  hidden_truth: '隱藏的真相',
  clue: '線索',
  clue_points_to: '線索指向',
  reveal: '揭曉',
  fairness_gap: '公平性缺口',
  note: '筆記',
  interpretation: '詮釋',
};

export function claimTypeLabel(claimType: string): string {
  return CLAIM_TYPES[claimType] ?? claimType;
}
