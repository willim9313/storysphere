/**
 * 每種 view 的元件都收這組 props（05 §4、§4.1）。
 *
 * - `runId`：結果卡詳情傳入；view 依 05 §4.1 取「整個分析」的證據，runId 只在 evidence_list 用。
 * - `evidenceIds`：agent 的 `show_view` 指定證據時傳入（T27）；有給就只畫這些。
 * - `onSelectEvidence`：點了某筆證據，詳情頁右欄打開它。
 */
export interface ViewProps {
  bookId: string;
  runId?: string;
  evidenceIds?: string[];
  onSelectEvidence?: (evidenceId: string) => void;
}
