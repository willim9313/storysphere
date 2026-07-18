import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { CharacterAnalysisDetail } from '@/api/types';
import type { NameIdEntry } from '../CharacterAnalysisDetail';

interface Props {
  data: CharacterAnalysisDetail;
  bookId: string;
  /** #5: name -> id lookup over the event analysis list, used to link a key
   * event to its entry on the event analysis page when the names match. */
  eventRoster: NameIdEntry[];
}

function pickField<T = string>(rec: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v) return v as T;
  }
  return undefined;
}

function pickChapter(rec: Record<string, unknown>): number | undefined {
  const v = rec['chapter'];
  return typeof v === 'number' ? v : undefined;
}

export function BehaviorPane({ data, bookId, eventRoster }: Props) {
  const { t } = useTranslation('analysis');
  const actions = data.cep?.actions ?? [];
  const keyEvents = data.cep?.keyEvents ?? [];
  // Sort by chapter; events without a numeric chapter sort last, stable
  // otherwise (matches canvas's `.slice().sort((a,b) => a.chapter - b.chapter)`).
  const sortedEvents = [...keyEvents].sort((a, b) => {
    const ca = pickChapter(a as Record<string, unknown>) ?? Number.POSITIVE_INFINITY;
    const cb = pickChapter(b as Record<string, unknown>) ?? Number.POSITIVE_INFINITY;
    return ca - cb;
  });

  return (
    <>
      {/* Actions */}
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h3 className="ca-section-title">{t('character.sections.actions')}</h3>
            <div className="ca-section-sub" style={{ marginTop: 2 }}>
              {t('character.behavior.actionsCount', { count: actions.length })}
            </div>
          </div>
        </header>
        <div className="ca-section-body">
          {actions.length === 0 ? (
            <p>{t('character.noData')}</p>
          ) : (
            <ul>
              {actions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </div>
      </section>

      {/* Key events */}
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h3 className="ca-section-title">{t('character.sections.keyEvents')}</h3>
            <div className="ca-section-sub" style={{ marginTop: 2 }}>
              {t('character.behavior.keyEventsSub', { count: keyEvents.length })}
            </div>
          </div>
        </header>
        <div className="ca-section-body">
          {sortedEvents.length === 0 ? (
            <p>{t('character.noData')}</p>
          ) : (
            <div className="ca-keyevent-list">
              {sortedEvents.map((ev, i) => {
                const rec = ev as Record<string, unknown>;
                const name = pickField(rec, ['event', 'title', 'name']) ?? '—';
                const chapter = pickChapter(rec);
                const significance = pickField(rec, ['significance', 'description']) ?? '';
                // #5 v1 name match: exact match against the event analysis
                // list (analyzed + unanalyzed), case/whitespace-insensitive.
                const matched = eventRoster.find(
                  (e) => e.name.trim().toLowerCase() === name.trim().toLowerCase(),
                );
                return (
                  <div key={i} className="ca-keyevent-card">
                    <div className="ca-keyevent-head">
                      <span className="ca-keyevent-chapter">
                        {chapter != null ? `Ch.${chapter}` : ''}
                      </span>
                      <span className="ca-keyevent-name">{name}</span>
                    </div>
                    {significance && (
                      <div className="ca-keyevent-sig">{significance}</div>
                    )}
                    {matched && (
                      <Link
                        to={`/books/${bookId}/events`}
                        state={{ selectId: matched.id }}
                        className="ca-keyevent-link"
                      >
                        {t('character.behavior.viewInEvents')} <ExternalLink size={10} />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
