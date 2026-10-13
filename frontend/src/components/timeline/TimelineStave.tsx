/**
 * 雙軌譜 (stave) — the 章節順序 view's primary visual.
 *
 * Each row plots narrative order along X and `deviation` along Y, so the
 * dashed midline reads as "the author told it in the order it happened".
 * A book that barely reorders anything renders as a near-flat line — which
 * is a *result*, not an empty state, and is why the headline states it.
 *
 * Rendered as SVG rather than the design prototype's rotated `div`s: the
 * geometry layer hands over endpoints, so a `<line>` needs no rotation math
 * and survives resize without recomputation.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  STAVE_MID,
  STAVE_ROW_HEIGHT,
  STAVE_ROW_HEIGHT_UNRANKED,
  STAVE_UNRANKED_BAND,
  type StaveAnnotation,
  type StaveRow,
  type TimelineDatum,
} from "@/lib/timelineGeometry";

function noteKey(a: StaveAnnotation): string {
  if (a.confirmed) {
    return a.kind === "flashback"
      ? "timeline.stave.flashbackJudged"
      : "timeline.stave.flashforwardJudged";
  }
  return a.kind === "flashback"
    ? "timeline.stave.flashbackNote"
    : "timeline.stave.flashforwardNote";
}

interface TimelineStaveProps {
  rows: StaveRow[];
  /** Whether any event in the whole book has a rank. Without one the plot
   *  area above the unranked band could only ever be empty, so it collapses
   *  to the chapter labels (whole book, not the filter — like the switch). */
  hasRanked: boolean;
  selectedChapter: number;
  selectedEventId: string | null;
  /** Ids excluded by the filter in *dim* mode (they are still drawn). */
  dimmedIds: Set<string>;
  onSelectChapter: (chapter: number) => void;
  onSelectEvent: (d: TimelineDatum) => void;
}

export function TimelineStave({
  rows,
  hasRanked,
  selectedChapter,
  selectedEventId,
  dimmedIds,
  onSelectChapter,
  onSelectEvent,
}: TimelineStaveProps) {
  const { t } = useTranslation("analysis");
  const plotHeight = hasRanked ? STAVE_ROW_HEIGHT : STAVE_ROW_HEIGHT_UNRANKED;
  const rootRef = useRef<HTMLDivElement>(null);

  /* Roving tabindex: the stave's event marks are one Tab stop. It lands on
     the selected event (else the first drawn one); ← → then step through the
     book (the page's handler) and focus follows the selection here. */
  const drawnIds = new Set<string>();
  for (const row of rows) {
    for (const p of row.points) drawnIds.add(p.id);
    for (const u of row.unranked) drawnIds.add(u.id);
  }
  const firstId = rows
    .flatMap((row) => [...row.points, ...row.unranked])
    .sort((a, b) => a.datum.index - b.datum.index)[0]?.id;
  const rovingId =
    selectedEventId && drawnIds.has(selectedEventId) ? selectedEventId : firstId;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !selectedEventId || !root.contains(document.activeElement)) return;
    root
      .querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedEventId)}"]`)
      ?.focus();
  }, [selectedEventId]);

  // Per-chapter event total (ranked + unranked) for the selected-band tag.
  const chapterCounts = new Map<number, number>();
  for (const row of rows) {
    for (const p of row.points) {
      chapterCounts.set(p.datum.chapter, (chapterCounts.get(p.datum.chapter) ?? 0) + 1);
    }
    for (const u of row.unranked) {
      chapterCounts.set(u.datum.chapter, (chapterCounts.get(u.datum.chapter) ?? 0) + 1);
    }
  }

  return (
    <div className={`tl-stave${hasRanked ? "" : " is-collapsed"}`} ref={rootRef}>
      {rows.map((row, i) => (
        <div
          className="tl-stave-row"
          key={i}
          style={{ height: plotHeight + STAVE_UNRANKED_BAND }}
        >
          {/* 44px gutter holds the 未排序 label; every plotted thing lives in
              the 1fr plot column so a point can never sit under the label. */}
          <span
            className="tl-stave-gutter-label"
            style={{ height: STAVE_UNRANKED_BAND }}
          >
            {t("timeline.stave.unranked")}
          </span>
          <div className="tl-stave-plot">
            {/* Chapter bands sit behind everything and are the click target
                for changing chapter. They cover filtered-out chapters too, so
                a chapter never disappears from the navigation. */}
            {row.bands.map((band) => (
              <button
                type="button"
                key={`${band.chapter}-${band.x1Pct}`}
                className={`tl-stave-band${band.chapter === selectedChapter ? " active" : ""}`}
                style={{
                  left: `${band.x1Pct}%`,
                  width: `${band.x2Pct - band.x1Pct}%`,
                  bottom: STAVE_UNRANKED_BAND,
                }}
                onClick={() => onSelectChapter(band.chapter)}
                aria-label={t("timeline.gotoChapter", { n: band.chapter })}
                aria-current={band.chapter === selectedChapter ? "true" : undefined}
              >
                <span className="tl-stave-band-label">Ch.{band.chapter}</span>
                {band.chapter === selectedChapter && (
                  <span className="tl-stave-band-tag">
                    {t("timeline.stave.chapterTag", {
                      n: band.chapter,
                      count: chapterCounts.get(band.chapter) ?? 0,
                    })}
                  </span>
                )}
              </button>
            ))}

            {hasRanked && (
              <svg
                className="tl-stave-svg"
                width="100%"
                height={STAVE_ROW_HEIGHT}
                aria-hidden="true"
                focusable="false"
              >
                <line
                  className="tl-stave-midline"
                  x1="0"
                  y1={STAVE_MID}
                  x2="100%"
                  y2={STAVE_MID}
                />
                {row.links.map((l, k) => (
                  <line
                    key={k}
                    className={`tl-stave-link${l.outlier ? " outlier" : ""}`}
                    x1={`${l.x1Pct}%`}
                    y1={l.y1Px}
                    x2={`${l.x2Pct}%`}
                    y2={l.y2Px}
                  />
                ))}
                {row.points
                  .filter((p) => p.outlier)
                  .map((p) => (
                    <circle
                      key={`halo-${p.id}`}
                      className={`tl-stave-halo${dimmedIds.has(p.id) ? " dim" : ""}`}
                      cx={`${p.xPct}%`}
                      cy={p.yPx}
                      r={p.radius + 3}
                    />
                  ))}
                {row.points.map((p) => (
                  <circle
                    key={p.id}
                    className={[
                      "tl-stave-dot",
                      p.outlier ? "outlier" : "",
                      p.hasAnalysis ? "analyzed" : "unanalyzed",
                      p.id === selectedEventId ? "selected" : "",
                      dimmedIds.has(p.id) ? "dim" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    cx={`${p.xPct}%`}
                    cy={p.yPx}
                    r={p.radius}
                  />
                ))}
              </svg>
            )}

            {/* Hit targets are separate from the SVG so each point gets a real
                focusable button with an accessible name. */}
            {row.points.map((p) => (
              <Tooltip
                key={p.id}
                label={`${p.datum.title} · rank ${p.datum.chronologicalRank?.toFixed(2)}`}
                anchorClassName="tl-stave-hit-anchor"
                anchorStyle={{ left: `${p.xPct}%`, top: p.yPx }}
              >
                <button
                  type="button"
                  className={`tl-stave-hit${p.id === selectedEventId ? " selected" : ""}`}
                  onClick={() => onSelectEvent(p.datum)}
                  data-event-id={p.id}
                  tabIndex={p.id === rovingId ? 0 : -1}
                  aria-pressed={p.id === selectedEventId}
                >
                  <span className="sr-only">{p.datum.title}</span>
                </button>
              </Tooltip>
            ))}

            {/* Two sources, two voices: a judged event states what it is, a
                merely-displaced one only reports where it sits. */}
            {row.annotations.map((a) => (
              <span
                key={a.id}
                className={`tl-stave-note ${a.align}${a.confirmed ? " confirmed" : ""}`}
                style={{ left: `${a.xPct}%`, top: a.yPx }}
              >
                {t(noteKey(a), { ch: a.chapter, count: a.count })}
              </span>
            ))}

            {/* rank === null is a stable class of events, so it gets a
                permanent home — rendered on every row even when it is empty,
                because the strip is part of the stave, not an empty state.
                Its marks speak the stave's own vocabulary (solid = analysed,
                dashed = not, larger = kernel): "unranked" is said by the band
                itself, so a mark never has to carry three meanings. The
                button is a 24px hit area around the small mark. */}
            <div
              className="tl-stave-unranked"
              style={{ height: STAVE_UNRANKED_BAND }}
            >
              {row.unranked.map((u) => (
                <Tooltip
                  key={u.id}
                  label={u.datum.title}
                  anchorClassName="tl-stave-unranked-anchor"
                  anchorStyle={{ left: `${u.xPct}%` }}
                >
                  <button
                    type="button"
                    className={[
                      "tl-stave-unranked-dot",
                      u.datum.isKernel ? "kernel" : "",
                      u.datum.hasAnalysis ? "analyzed" : "unanalyzed",
                      u.id === selectedEventId ? "selected" : "",
                      dimmedIds.has(u.id) ? "dim" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => onSelectEvent(u.datum)}
                    data-event-id={u.id}
                    tabIndex={u.id === rovingId ? 0 : -1}
                    aria-pressed={u.id === selectedEventId}
                  >
                    <span className="sr-only">{u.datum.title}</span>
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
