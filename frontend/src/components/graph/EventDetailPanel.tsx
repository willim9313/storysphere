import { X, Loader } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchEventDetail } from '@/api/graph';

import type { GraphNode } from '@/api/types';
import { qk } from '@/api/queryKeys';

interface EventDetailPanelProps {
  node: GraphNode;
  bookId: string;
  onClose: () => void;
  onShowAnalysis: () => void;
}

const ENTITY_TYPES = new Set(['character', 'location', 'organization', 'object', 'concept', 'event', 'other']);

export function EventDetailPanel({ node, bookId, onClose, onShowAnalysis }: EventDetailPanelProps) {
  const { t } = useTranslation('graph');

  const { data: detail, isLoading } = useQuery({
    queryKey: qk.event.detail(bookId, node.id),
    queryFn: () => fetchEventDetail(bookId, node.id),
  });

  return (
    <div className="kg-panel">
      <div className="kg-panel-head">
        <h3 className="kg-panel-title">{node.name}</h3>
        <button type="button" onClick={onClose} className="kg-icon-btn" aria-label={t('a11y.close')}>
          <X size={14} />
        </button>
      </div>

      <div className="kg-panel-body">
        {/* Event info — eventType chip, chapter, description, significance, consequences */}
        <div className="kg-chiprow">
          <span className="ss-pill ss-pill-event" style={{ margin: 0 }}>
            <span className="ss-pill-dot" />
            {node.eventType ?? 'event'}
          </span>
          {node.chapter != null && <span className="kg-note">{t('event.chapter', { chapter: node.chapter })}</span>}
        </div>
        {node.description && <p className="kg-text kg-serif">{node.description}</p>}
        {detail?.significance && (
          <div className="kg-chunk">
            <span className="kg-label">{t('event.significance')}</span>
            <p className="kg-text kg-serif">{detail.significance}</p>
          </div>
        )}
        {detail && detail.consequences.length > 0 && (
          <div className="kg-chunk">
            <span className="kg-label">{t('event.consequences')}</span>
            <ul className="kg-text" style={{ margin: 0, paddingLeft: '1.1em', listStyle: 'disc' }}>
              {detail.consequences.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Participants — `<type> <name>` chips only. The contract has no location
            field, and a participant of type location means "involved", not "where
            it happened", so there is no 發生地點 sub-heading. */}
        <section className="kg-section">
          <span className="kg-label">{t('panel.participants')}</span>
          {isLoading ? (
            <div className="kg-inline-load">
              <Loader size={12} className="animate-spin" />
              <span>{t('event.loading')}</span>
            </div>
          ) : detail && detail.participants.length > 0 ? (
            <div className="kg-chiprow">
              {detail.participants.map((p) => {
                const type = ENTITY_TYPES.has(p.type) ? p.type : 'other';
                return (
                  <span key={p.id} className={`ss-pill ss-pill-${type}`} style={{ margin: 0 }}>
                    {t(`entityTypes.${type}`)} {p.name}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="kg-note">{t('event.noParticipants')}</p>
          )}
        </section>

        {/* Analysis */}
        <section className="kg-section">
          <span className="kg-label">{t('panel.eventAnalysis')}</span>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary"
            style={{ alignSelf: 'flex-start' }}
            onClick={onShowAnalysis}
          >
            {t('event.viewEventAnalysis')}
          </button>
        </section>
      </div>
    </div>
  );
}
