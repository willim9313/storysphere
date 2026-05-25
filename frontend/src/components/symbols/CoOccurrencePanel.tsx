import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { CoOccurrenceEntry } from '@/api/symbols';
import { typeStyle } from './tokens';

type Tab = 'symbol' | 'character' | 'event';

interface ResolvedItem {
  id: string;
  name: string;
}

interface Props {
  bookId: string;
  coOccurrences: CoOccurrenceEntry[];
  linkedCharacters: ResolvedItem[];
  linkedEvents: ResolvedItem[];
  loading: boolean;
  onSelectCo: (id: string) => void;
}

export function CoOccurrencePanel({
  bookId,
  coOccurrences,
  linkedCharacters,
  linkedEvents,
  loading,
  onSelectCo,
}: Props) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('symbol');

  const tabs: { k: Tab; n: number }[] = [
    { k: 'symbol', n: coOccurrences.length },
    { k: 'character', n: linkedCharacters.length },
    { k: 'event', n: linkedEvents.length },
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
              (linkedCharacters.length === 0 ? (
                <p className="sym-card-empty">{t('symbol.interpretation.linkedEmpty')}</p>
              ) : (
                <div className="sym-link-list">
                  {linkedCharacters.map(({ id, name }) => (
                    <button
                      key={id}
                      type="button"
                      className="sym-link-row"
                      title={id}
                      onClick={() => navigate(`/books/${bookId}/characters`, { state: { selectId: id } })}
                    >
                      <span className="sym-link-dot" style={{ background: 'var(--entity-char-dot)' }} />
                      <span className="sym-link-name">{name}</span>
                    </button>
                  ))}
                </div>
              ))}
            {tab === 'event' &&
              (linkedEvents.length === 0 ? (
                <p className="sym-card-empty">{t('symbol.interpretation.linkedEmpty')}</p>
              ) : (
                <div className="sym-link-list">
                  {linkedEvents.map(({ id, name }) => (
                    <button
                      key={id}
                      type="button"
                      className="sym-link-row"
                      title={id}
                      onClick={() => navigate(`/books/${bookId}/events`, { state: { selectId: id } })}
                    >
                      <span className="sym-link-dot" style={{ background: 'var(--entity-evt-dot)' }} />
                      <span className="sym-link-name">{name}</span>
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
