import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail } from '@/api/types';

interface Props {
  data: CharacterAnalysisDetail;
}

export function RelationsPane({ data }: Props) {
  const { t } = useTranslation('analysis');
  const relations = data.cep?.relations ?? [];
  const quotes = data.cep?.quotes ?? [];

  return (
    <>
      {/* Relations */}
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h3 className="ca-section-title">{t('character.sections.relations')}</h3>
            <div className="ca-section-sub" style={{ marginTop: 2 }}>
              {t('character.relations.relationsCount', { count: relations.length })}
            </div>
          </div>
        </header>
        <div className="ca-section-body">
          {relations.length === 0 ? (
            <p>{t('character.noData')}</p>
          ) : (
            relations.map((r, i) => {
              const target = r.target ?? ((r as unknown as Record<string, unknown>)['targetName'] as string) ?? '—';
              return (
                <div key={i} className="ca-relation">
                  <div className="ca-relation-target">{target}</div>
                  <div className="ca-relation-type">{r.type ?? '—'}</div>
                  <div className="ca-relation-desc">{r.description ?? ''}</div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Quotes */}
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h3 className="ca-section-title">{t('character.sections.quotes')}</h3>
            <div className="ca-section-sub" style={{ marginTop: 2 }}>
              {t('character.relations.quotesCount', { count: quotes.length })}
            </div>
          </div>
        </header>
        <div className="ca-section-body">
          {quotes.length === 0 ? (
            <p>{t('character.noData')}</p>
          ) : (
            quotes.map((q, i) => (
              <blockquote key={i} className="ca-quote">
                「{q}」
              </blockquote>
            ))
          )}
        </div>
      </section>
    </>
  );
}
