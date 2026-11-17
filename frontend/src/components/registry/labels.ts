// 方法目錄的中文標籤（03 §1 的 key 值）；沒列到的照原樣顯示。

const LAYER: Record<string, string> = { universal: '通用', genre: '題材 · 推理' };
const IMPL_KIND: Record<string, string> = { llm: 'LLM', hybrid: '混合', algorithm: '演算法' };
const OWNER: Record<string, string> = { contract: '內建', user: '使用者' };
const SCOPE: Record<string, string> = {
  book: '整本書',
  per_character: '每個角色',
  per_character_chapter: '每個角色 × 每章',
  per_event: '每個事件',
  per_hidden_truth: '每個隱藏的真相',
  per_motif: '每個意象',
  per_trick: '每個詭計',
};

export const layerLabel = (layer: string | null) => (layer ? LAYER[layer] ?? layer : '—');
export const implKindLabel = (kind: string) => IMPL_KIND[kind] ?? kind;
export const ownerLabel = (owner: string) => OWNER[owner] ?? owner;
export const scopeLabel = (scope: string) => SCOPE[scope] ?? scope;
export const LAYERS = Object.keys(LAYER);
