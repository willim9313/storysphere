import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { CoOccurrenceEntry } from '@/api/symbols';
import { typeStyle } from './tokens';

type Tab = 'symbol' | 'character' | 'event';

interface Props {
  coOccurrences: CoOccurrenceEntry[];
  linkedCharacterIds: string[];
  linkedEventIds: string[];
  loading: boolean;
  onSelectCo: (id: string) => void;
}

export function CoOccurrencePanel({
  coOccurrences,
  linkedCharacterIds,
  linkedEventIds,
  loading,
  onSelectCo,
}: Props) {
  const { t } = useTranslation('analysis');
  const [tab, setTab] = useState<Tab>('symbol');

  const tabs: { k: Tab; n: number }[] = [
    { k: 'symbol', n: coOccurrences.length },
    { k: 'character', n: linkedCharacterIds.length },
    { k: 'event', n: linkedEventIds.length },
  ];

  return (
    <section className="sym-card">
      <div className="sym-card-head">
        <Link2 size={13} style={{ color: 'var(--accent)' }} />
        <span className="sym-card-title">{t('symbol.coOccurrences')}</span>
        <div className="sym-tabs">
          {tabs.map((tb) => (
            <button
              key={tb.k}
              type="button"
              className={'sym-tab' + (tab === tb.k ? ' is-active' : '')}
              onClick={() => setTab(tb.k)}
            >
              {t(`symbol.tabs.${tb.k}`)}
              <span className="sym-tab-count">{tb.n}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="sym-card-body">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {tab === 'symbol' &&
              (coOccurrences.length === 0 ? (
                <p className="sym-card-empty">{t('symbol.noCoOccurrences')}</p>
              ) : (
                <div className="sym-pill-grid">
                  {coOccurrences.map((co) => {
                    const s = typeStyle(co.imagery_type);
                    return (
                      <button
                        key={co.imagery_id}
                        type="button"
                        className="sym-co-pill"
                        style={{ background: s.bg, color: s.fg, borderColor: s.dot }}
                        onClick={() => onSelectCo(co.imagery_id)}
                      >
                        <span className="sym-co-dot" style={{ background: s.dot }} />
                        <span>{co.term}</span>
                        <span className="sym-co-count">{co.co_occurrence_count}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            {tab === 'character' &&
              (linkedCharacterIds.length === 0 ? (
                <p className="sym-card-empty">{t('symbol.interpretation.linkedEmpty')}</p>
              ) : (
                <div className="sym-link-list">
                  {linkedCharacterIds.map((id) => (
                    <button key={id} type="button" className="sym-link-row" title={id}>
                      <span className="sym-link-dot" style={{ background: 'var(--entity-char-dot)' }} />
                      <span className="sym-link-name">{id}</span>
                    </button>
                  ))}
                </div>
              ))}
            {tab === 'event' &&
              (linkedEventIds.length === 0 ? (
                <p className="sym-card-empty">{t('symbol.interpretation.linkedEmpty')}</p>
              ) : (
                <div className="sym-link-list">
                  {linkedEventIds.map((id) => (
                    <button key={id} type="button" className="sym-link-row" title={id}>
                      <span className="sym-link-dot" style={{ background: 'var(--entity-evt-dot)' }} />
                      <span className="sym-link-name">{id}</span>
                    </button>
                  ))}
                </div>
              ))}
          </>
        )}
      </div>
    </section>
  );
}
