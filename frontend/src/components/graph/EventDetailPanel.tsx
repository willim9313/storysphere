import { useState } from 'react';
import { X, ChevronDown, ChevronRight, Loader } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchEventDetail } from '@/api/graph';

import type { GraphNode } from '@/api/types';

interface EventDetailPanelProps {
  node: GraphNode;
  bookId: string;
  onClose: () => void;
  onShowAnalysis: () => void;
}

export function EventDetailPanel({ node, bookId, onClose, onShowAnalysis }: EventDetailPanelProps) {
  const { t } = useTranslation('graph');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['info', 'participants', 'analysis']));

  const { data: detail, isLoading } = useQuery({
    queryKey: ['books', bookId, 'events', node.id],
    queryFn: () => fetchEventDetail(bookId, node.id),
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      className="flex-shrink-0 h-full overflow-y-auto"
      style={{
        width: 260,
        backgroundColor: 'var(--panel-bg)',
        borderLeft: '1px solid var(--panel-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3"
        style={{ borderBottom: '1px solid var(--panel-border)' }}
      >
        <h3
          className="text-sm font-semibold truncate"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--panel-fg)' }}
        >
          {node.name}
        </h3>
        <button onClick={onClose} style={{ color: 'var(--panel-fg-muted)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Sections */}
      <div className="p-2 space-y-1">
        {/* Event Info */}
        <AccordionSection
          title={t('panel.eventInfo')}
          sectionKey="info"
          isOpen={openSections.has('info')}
          onToggle={toggleSection}
        >
          <span className="pill pill-evt">
            <span className="pill-dot" />
            {node.eventType ?? 'event'}
          </span>
          {node.chapter != null && (
            <p className="text-xs mt-1" style={{ color: 'var(--panel-fg-muted)' }}>
              {t('event.chapter', { chapter: node.chapter })}
            </p>
          )}
          {node.description && (
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--panel-fg)' }}>
              {node.description}
            </p>
          )}
          {detail?.significance && (
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--panel-fg-muted)' }}>
              <strong>{t('event.significance')}</strong>{detail.significance}
            </p>
          )}
          {detail && detail.consequences.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium" style={{ color: 'var(--panel-fg-muted)' }}>{t('event.consequences')}</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside" style={{ color: 'var(--panel-fg)' }}>
                {detail.consequences.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </AccordionSection>

        {/* Participants */}
        <AccordionSection
          title={t('panel.participants')}
          sectionKey="participants"
          isOpen={openSections.has('participants')}
          onToggle={toggleSection}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader size={12} className="animate-spin" style={{ color: 'var(--panel-fg-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--panel-fg-muted)' }}>{t('event.loading')}</span>
            </div>
          ) : detail && detail.participants.length > 0 ? (
            <ul className="space-y-1">
              {detail.participants.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5">
                  <span className={`pill pill-${p.type === 'character' ? 'char' : p.type === 'location' ? 'loc' : p.type === 'concept' ? 'con' : 'evt'}`} style={{ fontSize: '10px' }}>
                    <span className="pill-dot" />
                    {p.type}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--panel-fg)' }}>{p.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs" style={{ color: 'var(--panel-fg-muted)' }}>{t('event.noParticipants')}</p>
          )}
          {detail?.location && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="pill pill-loc" style={{ fontSize: '10px' }}>
                <span className="pill-dot" />
                location
              </span>
              <span className="text-xs" style={{ color: 'var(--panel-fg)' }}>{detail.location.name}</span>
            </div>
          )}
        </AccordionSection>

        {/* Analysis */}
        <AccordionSection
          title={t('panel.eventAnalysis')}
          sectionKey="analysis"
          isOpen={openSections.has('analysis')}
          onToggle={toggleSection}
        >
          <button
            className="text-xs px-2 py-1 rounded"
            style={{ backgroundColor: 'var(--panel-bg-card)', color: 'var(--panel-fg)', border: '1px solid var(--panel-border)' }}
            onClick={onShowAnalysis}
          >
            {t('event.viewEventAnalysis')}
          </button>
        </AccordionSection>
      </div>
    </div>
  );
}

function AccordionSection({
  title,
  sectionKey,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  sectionKey: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ backgroundColor: 'var(--panel-bg-card)' }}
    >
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
        onClick={() => onToggle(sectionKey)}
      >
        {isOpen ? (
          <ChevronDown size={12} style={{ color: 'var(--panel-fg-muted)' }} />
        ) : (
          <ChevronRight size={12} style={{ color: 'var(--panel-fg-muted)' }} />
        )}
        <span className="text-xs font-medium" style={{ color: 'var(--panel-fg)' }}>
          {title}
        </span>
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
