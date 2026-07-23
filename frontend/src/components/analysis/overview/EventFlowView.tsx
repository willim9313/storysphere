import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TimelineData } from '@/api/types';
import { buildAdjacency, buildContextChains } from './eventAdjacency';
import { importanceClass, type OverviewEvent } from './eventTypes';

interface EventFlowViewProps {
  events: OverviewEvent[];
  timeline: TimelineData | undefined;
  onSelectEvent: (id: string) => void;
}

function abbr(e: OverviewEvent): string {
  if (e.importance === 'KERNEL') return 'K';
  if (e.importance === 'SATELLITE') return 'S';
  return '·';
}

export function EventFlowView({ events, timeline, onSelectEvent }: Readonly<EventFlowViewProps>) {
  const { t } = useTranslation('analysis');

  const chains = useMemo(() => {
    const adjacency = buildAdjacency(events, timeline);
    return buildContextChains(events, adjacency);
  }, [events, timeline]);

  return (
    <>
      <div className="ea-ov-caption">{t('event.overview.flow.caption')}</div>

      {chains.length === 0 ? (
        <div className="ea-flow-empty">
          <div className="ea-flow-empty-title">{t('event.overview.flow.emptyTitle')}</div>
          <p className="ea-flow-empty-body">{t('event.overview.flow.emptyBody')}</p>
        </div>
      ) : (
        <div className="ea-flow-chains">
          {chains.map((chain, i) => (
            <div key={chain[0].id} className="ea-flow-chain">
              <div className="ea-flow-chain-label">
                {t('event.overview.flow.chainLabel', { idx: i + 1, count: chain.length })}
              </div>
              <div className="ea-flow-nodes">
                {chain.map((e, j) => (
                  <div key={e.id} className="ea-flow-node-wrap">
                    <button
                      type="button"
                      className="ea-flow-node"
                      onClick={() => onSelectEvent(e.id)}
                    >
                      <div className="ea-flow-node-head">
                        <span className={'ea-imp ' + importanceClass(e.importance)}>{abbr(e)}</span>
                        <span className="ea-flow-node-ch">
                          {t('event.list.chapterShort', { n: e.chapter })}
                        </span>
                      </div>
                      <div className="ea-flow-node-title">{e.title}</div>
                    </button>
                    {j < chain.length - 1 && (
                      <span className="ea-flow-arrow">
                        <ArrowRight size={16} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
