import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TimelineData } from '@/api/types';
import { buildAdjacency, buildContextChains } from './eventAdjacency';
import type { OverviewEvent } from './eventTypes';

interface EventFlowViewProps {
  events: OverviewEvent[];
  timeline: TimelineData | undefined;
  onSelectEvent: (id: string) => void;
}

export function EventFlowView({ events, timeline, onSelectEvent }: Readonly<EventFlowViewProps>) {
  const { t } = useTranslation('analysis');

  const { chains, adjacency } = useMemo(() => {
    const adj = buildAdjacency(events, timeline);
    return { chains: buildContextChains(events, adj), adjacency: adj };
  }, [events, timeline]);

  // Who the step shares with its neighbour in the chain — without it nobody can
  // check why two events were strung together.
  const sharedNames = (chain: OverviewEvent[], j: number): string => {
    const [from, to] = j === 0 ? [chain[0], chain[1]] : [chain[j - 1], chain[j]];
    const hit = adjacency.subsequent(from.id).find((n) => n.event.id === to.id);
    return hit ? hit.shared.slice(0, 3).join('、') : '';
  };

  return (
    <div className="ea-ov-card">
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
              {chain.map((e, j) => (
                <div key={e.id} className="ea-flow-step">
                  <button type="button" className="ea-flow-node" onClick={() => onSelectEvent(e.id)}>
                    <span className="ea-flow-node-ch">
                      {t('event.list.chapterShort', { n: e.chapter })}
                    </span>
                    <span className="ea-flow-node-title">{e.title}</span>
                    {sharedNames(chain, j) && (
                      <span className="ea-flow-node-shared">
                        {t('event.context.shared', { names: sharedNames(chain, j) })}
                      </span>
                    )}
                  </button>
                  {j < chain.length - 1 && (
                    <span className="ea-flow-arrow" aria-hidden="true">
                      <ArrowRight size={13} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="ea-ov-caption">{t('event.overview.flow.caption')}</p>
    </div>
  );
}
