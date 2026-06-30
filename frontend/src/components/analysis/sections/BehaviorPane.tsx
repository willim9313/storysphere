import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail } from '@/api/types';

interface Props {
  data: CharacterAnalysisDetail;
}

function pickField<T = string>(rec: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v) return v as T;
  }
  return undefined;
}

export function BehaviorPane({ data }: Props) {
  const { t } = useTranslation('analysis');
  const actions = data.cep?.actions ?? [];
  const keyEvents = data.cep?.keyEvents ?? [];

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
          {keyEvents.length === 0 ? (
            <p>{t('character.noData')}</p>
          ) : (
            keyEvents.map((ev, i) => {
              const rec = ev as Record<string, unknown>;
              const name = pickField(rec, ['event', 'title', 'name']) ?? '—';
              const chapter = pickField(rec, ['chapter']) ?? '';
              const significance = pickField(rec, ['significance', 'description']) ?? '';
              return (
                <div key={i} className="ca-event">
                  <div className="ca-event-chapter">{chapter ? `Ch.${chapter}` : ''}</div>
                  <div>
                    <div className="ca-event-name">{name}</div>
                    {significance && <div className="ca-event-sig">{significance}</div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
