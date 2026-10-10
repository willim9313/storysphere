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

/** 核心帶節點名的寬度上限（px）。 */
export const NODE_LABEL_MAX_W = 80;
/** 欄寬只容得下比這更窄的標籤時就不畫標籤（只剩 2 字＋省略號，讀不出東西）；靠 Tooltip 與可及名稱。 */
export const NODE_LABEL_MIN_W = 40;
/** 圓點最小直徑：再小就點不到、看不出敘事模式。 */
export const NODE_MIN_SIZE = 8;

/**
 * 依每章欄寬（px）收斂節點：圓點不超過欄寬 − 4，標籤寬上限為欄寬 − 6（最多 80），
 * 放不下 40px 就不顯示標籤。`colWidth` 為 0（尚未量到）時照原尺寸。
 * 只縮水平方向：各帶的行距不變，所以縱向間距與帶高都不受影響。
 */
export function fitNode(
  colWidth: number,
  node: number,
  labelled: boolean,
): { size: number; labelWidth: number | null } {
  if (colWidth <= 0) return { size: node, labelWidth: labelled ? NODE_LABEL_MAX_W : null };
  const size = Math.max(NODE_MIN_SIZE, Math.min(node, Math.floor(colWidth - 4)));
  const room = Math.min(NODE_LABEL_MAX_W, Math.floor(colWidth - 6));
  return { size, labelWidth: labelled && room >= NODE_LABEL_MIN_W ? room : null };
}

