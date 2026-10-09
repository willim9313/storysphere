import { useTranslation } from "react-i18next";
import type { AnalysisItem, UnanalyzedEntity } from "@/api/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { mentionBarWidth } from "./characterModel";

/**
 * 左欄清單列（動作列·行內按鈕變體，DS v3 第 3 批 · 09）。
 *   上行：姓名；下行：提及量長條＋數值＋「建立」（第二行固定 28px）。
 *   狀態點與「建立」二擇一：已分析列有點、未分析列有按鈕。
 * 長條是平方根尺度 6 + 94√(m/max)（px），讓提及 1–3 次的長尾仍看得出差異。
 */

export function AnalyzedItem({
  item,
  isSelected,
  onSelect,
  maxMentionCount,
  itemId,
}: Readonly<{
  item: AnalysisItem;
  isSelected: boolean;
  onSelect: () => void;
  maxMentionCount?: number;
  itemId?: string;
}>) {
  const { t } = useTranslation("analysis");
  const partial = item.status === "partial";
  return (
    <div id={itemId} className={"ca-row" + (isSelected ? " selected" : "")}>
      <button
        type="button"
        className="ca-row-main"
        aria-current={isSelected ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="ca-row-avatar">{item.title[0]}</span>
        <span className="ca-row-body">
          <span className="ca-row-name">{item.title}</span>
          {maxMentionCount !== undefined && (
            <span className="ca-row-meta">
              <span
                className="ca-row-bar"
                style={{
                  width: mentionBarWidth(item.mentionCount, maxMentionCount),
                }}
              />
              <span
                className="ca-row-count"
                aria-label={t("character.list.mentionCount", {
                  count: item.mentionCount,
                })}
              >
                {item.mentionCount}
              </span>
            </span>
          )}
        </span>
        {partial ? (
          <Tooltip label={t("event.partialBadge")}>
            <span
              className="ca-row-dot partial"
              role="img"
              aria-label={t("event.partialBadge")}
            />
          </Tooltip>
        ) : (
          <span className="ca-row-dot" />
        )}
      </button>
    </div>
  );
}

export function UnanalyzedItem({
  item,
  isSelected,
  onSelect,
  onGenerate,
  isGenerating,
  failed,
  maxMentionCount,
  itemId,
}: Readonly<{
  item: UnanalyzedEntity;
  isSelected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  /** The last batch run failed on this one: marked with a diamond dot (shape,
   *  not hue — Ink has one colour for every status). */
  failed?: boolean;
  maxMentionCount?: number;
  itemId?: string;
}>) {
  const { t } = useTranslation("analysis");

  return (
    <div
      id={itemId}
      className={
        "ca-row pending" +
        (failed ? " is-failed" : "") +
        (isSelected ? " selected" : "")
      }
    >
      <button
        type="button"
        className="ca-row-main"
        aria-current={isSelected ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="ca-row-avatar">{item.name[0]}</span>
        <span className="ca-row-body">
          <span className="ca-row-name">{item.name}</span>
          <span className="ca-row-meta">
            {maxMentionCount !== undefined && (
              <>
                <span
                  className="ca-row-bar"
                  style={{
                    width: mentionBarWidth(item.mentionCount, maxMentionCount),
                  }}
                />
                <span
                  className="ca-row-count"
                  aria-label={t("character.list.mentionCount", {
                    count: item.mentionCount,
                  })}
                >
                  {item.mentionCount}
                </span>
              </>
            )}
          </span>
        </span>
        {failed && (
          <Tooltip label={t("character.batch.stat.failed")}>
            <span
              className="ca-row-dot failed"
              role="img"
              aria-label={t("character.batch.stat.failed")}
            />
          </Tooltip>
        )}
      </button>
      <button
        type="button"
        className="ss-btn ss-btn-sm ss-btn-ghost ss-btn-llm ca-row-create"
        onClick={onGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? "…" : t("character.list.createBtn")}
      </button>
    </div>
  );
}
