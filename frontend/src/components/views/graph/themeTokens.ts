import { useSyncExternalStore } from 'react';

/**
 * cytoscape 的樣式讀不到 CSS 變數，也不認 oklch()：
 * 從 :root 讀出 token 的值，再畫到 1×1 canvas 上取回 rgb，交給 cytoscape。
 */
let probe: CanvasRenderingContext2D | null = null;

function toRgb(cssColor: string): string {
  if (!probe) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!probe || !cssColor) return cssColor;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = cssColor;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/** 讀一個顏色 token（例如 `--cat-1`），回 cytoscape 認得的 `rgb(...)`。 */
export function colorToken(name: string): string {
  return toRgb(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}

/** 讀一個非顏色 token（例如 `--font-sans`）。 */
export function rawToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 第 i 個（0 起算）分類色，`--cat-1`…`--cat-5` 輪流。 */
export const CATEGORY_COUNT = 5;
export function categoryToken(index: number): string {
  return `--cat-${(index % CATEGORY_COUNT) + 1}`;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** 目前主題（`data-theme`）；切換時讓元件重新套 cytoscape 樣式。 */
export function useThemeName(): string {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? '');
}
