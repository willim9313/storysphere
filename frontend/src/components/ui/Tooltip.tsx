import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** 共用 Tooltip（components-tooltip 規格卡，取代原生 title）。
 *  反相小籤、無動畫；hover 延遲 400ms、鍵盤 :focus-visible 立即、離開立即隱藏。
 *  rail 朝右、其餘朝上，碰邊翻面。停用的控制項要把 Tooltip 掛在外層包裹上
 *  （disabled 元件不觸發滑鼠事件）。 */

const HOVER_DELAY_MS = 400;
const OFFSET = 8; // 規格：距 8
const EDGE = 4; // 與視窗邊緣保留的最小距離

export type TooltipPlacement = 'top' | 'right';

interface TooltipProps {
  readonly label: ReactNode;
  /** rail 用 'right'；其餘預設 'top'。 */
  readonly placement?: TooltipPlacement;
  /** rail 標籤不換行（其餘最寬 240、可換行）。 */
  readonly nowrap?: boolean;
  /** true 時不顯示（例如側欄展開後標籤已直接可見）。 */
  readonly disabled?: boolean;
  /** 錨點 span 的額外 class／style：被包的元素原本靠絕對定位或 flex 尺寸排版時，
   *  把那些屬性移到錨點上（錨點才是排版裡的那個盒子）。 */
  readonly anchorClassName?: string;
  readonly anchorStyle?: CSSProperties;
  readonly children: ReactNode;
}

interface Pos {
  readonly left: number;
  readonly top: number;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, Math.max(min, max)));
}

function place(anchor: DOMRect, tip: DOMRect, placement: TooltipPlacement): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (placement === 'right') {
    let left = anchor.right + OFFSET;
    if (left + tip.width > vw - EDGE) left = anchor.left - OFFSET - tip.width;
    const top = clamp(anchor.top + anchor.height / 2 - tip.height / 2, EDGE, vh - tip.height - EDGE);
    return { left, top };
  }
  let top = anchor.top - OFFSET - tip.height;
  if (top < EDGE) top = anchor.bottom + OFFSET;
  const left = clamp(anchor.left + anchor.width / 2 - tip.width / 2, EDGE, vw - tip.width - EDGE);
  return { left, top };
}

export function Tooltip({
  label,
  placement = 'top',
  nowrap = false,
  disabled = false,
  anchorClassName,
  anchorStyle,
  children,
}: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);

  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  // 第一次渲染先量好自己的尺寸，再算位置（visibility:hidden 期間使用者看不到）。
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    setPos(place(anchorRef.current.getBoundingClientRect(), tipRef.current.getBoundingClientRect(), placement));
  }, [open, placement, label]);

  const onMouseEnter = () => {
    if (disabled) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), HOVER_DELAY_MS);
  };

  const onFocus = (e: FocusEvent) => {
    if (disabled) return;
    let visible = false;
    try { visible = (e.target as HTMLElement).matches(':focus-visible'); } catch { /* 舊瀏覽器 */ }
    if (visible) setOpen(true);
  };

  return (
    <span
      ref={anchorRef}
      className={anchorClassName ? `ss-tooltip-anchor ${anchorClassName}` : 'ss-tooltip-anchor'}
      style={anchorStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={hide}
      onFocus={onFocus}
      onBlur={hide}
      onClick={hide}
      onKeyDown={(e) => { if (e.key === 'Escape') hide(); }}
    >
      {children}
      {open && !disabled &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            className={nowrap ? 'ss-tooltip ss-tooltip-nowrap' : 'ss-tooltip'}
            style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
