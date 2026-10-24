import { useCallback, useEffect, useState } from 'react';

import {
  collapseKey,
  isCollapsed,
  readCollapsed,
  writeCollapsed,
  type BatchPanelPage,
  type BatchPanelState,
} from '@/components/analysis/batchPanelModel';

/**
 * 批次面板的收合覆寫（09·10 決議紀錄 B 區）。
 *
 * 預設由資料決定（第 1–3 態展開）；使用者收起後記在 localStorage，以「書 × 頁」為單位。
 * 進入第 4 態時清掉覆寫：之後計數回升回到第 1 態，新出現的待生成項目不被舊的「收起」藏住。
 */
export function useBatchPanelCollapse(
  bookId: string,
  page: BatchPanelPage,
  state: BatchPanelState,
) {
  const key = collapseKey(bookId, page);
  const [rec, setRec] = useState(() => ({ key, override: readCollapsed(key) }));

  // 換書時重讀（同一個頁面元件實例可能收到新的 bookId）。
  let override = rec.override;
  if (rec.key !== key) {
    override = readCollapsed(key);
    setRec({ key, override });
  }
  // 第 4 態：覆寫作廢。記憶體裡的值在 render 中歸零，localStorage 在 effect 裡清。
  if (state === 'done' && override) {
    override = false;
    setRec({ key, override: false });
  }

  useEffect(() => {
    if (state === 'done') writeCollapsed(key, false);
  }, [state, key]);

  const toggle = useCallback(() => {
    const next = !override;
    writeCollapsed(key, next);
    setRec({ key, override: next });
  }, [key, override]);

  return { collapsed: isCollapsed(state, override), toggle };
}
