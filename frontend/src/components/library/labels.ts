// 書庫用的中文標籤。題材 id 來自 backend `domain/genres.py`；步驟來自 02 §1、04 §3.5 `ingest.step`。

const GENRE_LABELS: Record<string, string> = {
  mystery: '推理',
  thriller: '驚悚',
  science_fiction: '科幻',
  fantasy: '奇幻',
  horror: '恐怖',
  romance: '愛情',
  historical: '歷史',
  wuxia_xianxia: '武俠仙俠',
  adventure: '冒險',
  literary: '純文學',
};

const STAGE_LABELS: Record<string, string> = {
  p1: 'P1 文件處理',
  review: '章節審閱',
  s1: 'S1 核心抽取＋訊號',
  s2: 'S2 整併',
  s3: 'S3 題材判定',
  s4: 'S4 深度抽取',
  s5: 'S5 預設分析',
};

export function genreLabel(genre: string): string {
  return GENRE_LABELS[genre] ?? genre;
}

/** job.stage → 顯示用；未知值原樣顯示，沒有就回 null。 */
export function stageLabel(stage: string | null | undefined): string | null {
  if (!stage) return null;
  return STAGE_LABELS[stage.toLowerCase()] ?? stage;
}

export const ACTIVE_INGEST = new Set(['pending', 'running']);

export const UPLOAD_ACCEPT = '.pdf,.docx,.txt,.epub';
