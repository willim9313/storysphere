/**
 * 故事時序 view — events in the order they actually happened (fabula).
 *
 * Split into columns rather than one long list so a whole book fits on screen
 * without scrolling. Events without a `chronological_rank` cannot be placed
 * here at all, so they get a tray at the bottom instead of being dropped.
 */

import { useTranslation } from 'react-i18next';
import type { TimelineDatum } from '@/lib/timelineGeometry';

const COLUMNS = 4;
/** Tray chips shown before deferring to "show the rest". */
const TRAY_VISIBLE = 4;

interface StoryOrderViewProps {
  ranked: TimelineDatum[];
  unranked: TimelineDatum[];
  dimmedIds: Set<string>;
  selectedEventId: string | null;
  onSelectEvent: (d: TimelineDatum) => void;
  /** Applies a filter that brings every unranked event into the main view. */
  onShowAllUnranked: () => void;
}

export function StoryOrderView({
  ranked,
  unranked,
  dimmedIds,
  selectedEventId,
  onSelectEvent,
  onShowAllUnranked,
}: StoryOrderViewProps) {
  const { t } = useTranslation('analysis');

  const perColumn = Math.ceil(ranked.length / COLUMNS) || 1;
  const columns = Array.from({ length: COLUMNS }, (_, c) =>
    ranked.slice(c * perColumn, (c + 1) * perColumn),
  );
  const trayMore = Math.max(0, unranked.length - TRAY_VISIBLE);

  return (
    <div className="tl-story">
      <header className="tl-view-head">
        <h2 className="tl-view-headline">
          {t('timeline.story.headline', { n: ranked.length })}
        </h2>
        <p className="tl-view-meta">{t('timeline.story.meta')}</p>
      </header>

      <div className="tl-story-cols">
        {columns.map((col, c) => (
          <ol className="tl-story-col" key={c} start={c * perColumn + 1}>
            {col.map((d, k) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={[
                    'tl-story-row',
                    d.id === selectedEventId ? 'selected' : '',
                    dimmedIds.has(d.id) ? 'dim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelectEvent(d)}
                >
                  <span className="tl-story-n">{c * perColumn + k + 1}</span>
                  <span className={`tl-story-title${d.isKernel ? ' kernel' : ''}`}>
                    {d.title}
                  </span>
                  <span className={`tl-story-ch${d.outlier ? ' outlier' : ''}`}>
                    Ch.{d.chapter}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ))}
      </div>

      {unranked.length > 0 && (
        <div className="tl-story-tray">
          <span className="tl-story-tray-label">
            {t('timeline.story.trayLabel', { n: unranked.length })}
          </span>
          {unranked.slice(0, TRAY_VISIBLE).map((d) => (
            <button
              type="button"
              key={d.id}
              className={`tl-story-chip${d.id === selectedEventId ? ' selected' : ''}`}
              onClick={() => onSelectEvent(d)}
              title={d.title}
            >
              <span className="tl-story-chip-ch">Ch.{d.chapter}</span>
              {d.title}
            </button>
          ))}
          {trayMore > 0 && (
            <button type="button" className="tl-btn tl-btn-ghost" onClick={onShowAllUnranked}>
              {t('timeline.story.trayMore', { n: trayMore })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
