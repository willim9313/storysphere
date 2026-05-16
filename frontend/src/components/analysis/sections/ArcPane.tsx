import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail } from '@/api/types';

interface Props {
  data: CharacterAnalysisDetail;
}

export function ArcPane({ data }: Props) {
  const { t } = useTranslation('analysis');
  const arc = data.arc ?? [];

  return (
    <section className="ca-section">
      <header className="ca-section-head">
        <div>
          <h3 className="ca-section-title">{t('character.sections.arc')}</h3>
          <div className="ca-section-sub" style={{ marginTop: 2 }}>
            {t('character.arcPane.stagesCount', { count: arc.length })}
          </div>
        </div>
      </header>
      <div className="ca-section-body">
        {arc.length === 0 ? (
          <p>{t('character.noData')}</p>
        ) : (
          <div className="ca-arc">
            {arc.map((seg, i) => (
              <div key={i} className="ca-arc-segment">
                <div className="ca-arc-chapter">
                  Ch.{seg.chapterRange}
                  <span className="sub">{t('character.arcPane.stageN', { n: i + 1 })}</span>
                </div>
                <div className="ca-arc-body">
                  <span className="phase">{seg.phase}</span>
                  <p style={{ margin: 0, fontFamily: 'var(--font-serif)' }}>{seg.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
