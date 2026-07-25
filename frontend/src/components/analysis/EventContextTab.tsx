import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEventAnalysis } from '@/hooks/useEventAnalysis';
import { useTimeline } from '@/hooks/useTimeline';
import { buildAdjacency, type Neighbour } from './overview/eventAdjacency';
import { buildOverviewEvents, importanceClass } from './overview/eventTypes';

interface EventContextTabProps {
  bookId: string;
  eventId: string;
  onSelectEvent?: (id: string) => void;
}

/** How many neighbours each side shows before the "N more" toggle. Hub
 *  characters push the raw count past 40; three is what fits the reading. */
const VISIBLE = 3;

export function EventContextTab({ bookId, eventId, onSelectEvent }: Readonly<EventContextTabProps>) {
  const { t } = useTranslation('analysis');
  const { data: evtData } = useEventAnalysis(bookId);
  const { data: timeline } = useTimeline(bookId, 'narrative');

  const { prior, subsequent } = useMemo(() => {
    if (!evtData) return { prior: [], subsequent: [] };
    const events = buildOverviewEvents(evtData, timeline);
    const adjacency = buildAdjacency(events, timeline);
    return { prior: adjacency.prior(eventId), subsequent: adjacency.subsequent(eventId) };
  }, [evtData, timeline, eventId]);

  const hasAny = prior.length > 0 || subsequent.length > 0;

  return (
    <div className="ea-section">
      <div className="ea-section-head">
        <div className="ea-section-titlewrap">
          <h3 className="ea-section-title">{t('event.context.title')}</h3>
          <span className="ea-section-sub">{t('event.context.sub')}</span>
        </div>
      </div>
      <p className="ea-context-caveat">{t('event.context.caveat')}</p>

      {!hasAny ? (
        <p className="ea-context-empty">{t('event.context.empty')}</p>
      ) : (
        <div className="ea-context-cols">
          <NeighbourColumn
            label={t('event.context.prior')}
            emptyLabel={t('event.context.noPrior')}
            neighbours={prior}
            onSelectEvent={onSelectEvent}
          />
          <div className="ea-context-arrow">
            <ArrowRight size={18} />
          </div>
          <NeighbourColumn
            label={t('event.context.subsequent')}
            emptyLabel={t('event.context.noSubsequent')}
            neighbours={subsequent}
            onSelectEvent={onSelectEvent}
          />
        </div>
      )}
    </div>
  );
}

function NeighbourColumn({
  label,
  emptyLabel,
  neighbours,
  onSelectEvent,
}: Readonly<{
  label: string;
  emptyLabel: string;
  neighbours: Neighbour[];
  onSelectEvent?: (id: string) => void;
}>) {
  const { t } = useTranslation('analysis');
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? neighbours : neighbours.slice(0, VISIBLE);
  const hidden = neighbours.length - shown.length;

  return (
    <div className="ea-context-col">
      <div className="ea-context-col-label">
        {label}
        {neighbours.length > 0 && <span className="ea-context-count">{neighbours.length}</span>}
      </div>
      {neighbours.length === 0 ? (
        <p className="ea-context-col-empty">{emptyLabel}</p>
      ) : (
        <>
          {shown.map((n) => (
            <button
              key={n.event.id}
              type="button"
              className="ea-context-card"
              onClick={() => onSelectEvent?.(n.event.id)}
            >
              <div className="ea-context-card-head">
                <span className={'ea-imp ' + importanceClass(n.event.importance)}>
                  {n.event.importance === 'KERNEL' ? 'K' : n.event.importance === 'SATELLITE' ? 'S' : '·'}
                </span>
                <span className="ea-context-card-ch">
                  {t('event.list.chapterShort', { n: n.event.chapter })}
                </span>
              </div>
              <div className="ea-context-card-title">{n.event.title}</div>
              <div className="ea-context-card-shared">
                {t('event.context.shared', { names: n.shared.slice(0, 3).join('、') })}
              </div>
            </button>
          ))}
          {hidden > 0 && (
            <button
              type="button"
              className="ea-context-more"
              onClick={() => setExpanded(true)}
            >
              {t('event.context.more', { count: hidden })}
            </button>
          )}
          {expanded && neighbours.length > VISIBLE && (
            <button
              type="button"
              className="ea-context-more"
              onClick={() => setExpanded(false)}
            >
              {t('event.context.collapse')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
