/** 骨幹圖純邏輯（DS v3 第 3 批 · 10 事件分析 §3.2）。 */

/** 核心帶節點名：超過 5 字截斷（稿明文）。以 code point 計，避免把代理對切半。 */
export const NODE_LABEL_MAX = 5;

export function truncateNodeLabel(title: string, max = NODE_LABEL_MAX): string {
  const chars = Array.from(title);
  return chars.length > max ? chars.slice(0, max).join('') + '…' : title;
}

/** 上下各 14px 的內距（稿明文）。 */
export const BAND_PAD = 14;

/** 帶高 = 該帶最密集章節的節點數 × 行距 + 上下各 BAND_PAD；至少容納一格。 */
export function bandHeight(densest: number, rowH: number): number {
  return Math.max(1, densest) * rowH + BAND_PAD * 2;
}
