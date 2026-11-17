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

// view 的標題（registry/views/views.yaml 的 description 冒號前那段；詳情頁、Agent 結果的 view 區標題）。
const VIEW_TITLES: Record<string, string> = {
  causal_graph: '事件因果圖',
  character_arc: '角色 × 章節的弧線',
  network: '角色網路',
  knowledge_matrix: '角色 × 章節的知情狀態',
  fairness_matrix: '真相 × 章節',
  suspect_matrix: '嫌疑人 × 線索',
  evidence_list: '證據列表',
};

export function viewTitle(viewType: string | null): string {
  return (viewType && VIEW_TITLES[viewType]) ?? '證據列表';
}
