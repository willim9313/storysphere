import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { importanceClass, type Importance, type OverviewEvent } from './eventTypes';

interface EventRankingViewProps {
  events: OverviewEvent[];
  onSelectEvent: (id: string) => void;
  onGenerate: (id: string) => void;
  generatingId: string | null;
}

const DEFAULT_ROWS = 11;

export function EventRankingView({
  events,
  onSelectEvent,
  onGenerate,
  generatingId,
}: Readonly<EventRankingViewProps>) {
  const { t } = useTranslation('analysis');
  const [expanded, setExpanded] = useState(false);

  const importanceLabel = (importance: Importance) => {
    if (importance === 'KERNEL') return t('event.importance.kernel');
    if (importance === 'SATELLITE') return t('event.importance.satellite');
    return t('event.overview.undetermined');
  };

  const importanceAbbr = (importance: Importance) => {
    if (importance === 'KERNEL') return t('event.list.kernelAbbr');
    if (importance === 'SATELLITE') return t('event.list.satelliteAbbr');
    return '·';
  };

  const hero = events[0];
  if (!hero) return null;

  const rest = events.slice(1);
  const shown = expanded ? rest : rest.slice(0, DEFAULT_ROWS);
  const maxParticipants = Math.max(1, ...events.map((e) => e.participants));

  return (
    <>
      <div className="ea-ov-caption">{t('event.overview.ranking.caption')}</div>

      <div className="ea-ov-hero">
        <span className="ea-ov-hero-rank">#1</span>
        <div className="ea-ov-hero-body">
          <div className="ea-ov-hero-title">
            <span className="ea-ov-hero-name">{hero.title}</span>
            <span
              className={'ea-imp ' + importanceClass(hero.importance)}
              title={importanceLabel(hero.importance)}
            >
              {importanceAbbr(hero.importance)}
            </span>
          </div>
          <div className="ea-ov-hero-sub">
            {t('event.overview.ranking.heroSub', {
              chapter: hero.chapter ?? '—',
              importance: importanceLabel(hero.importance),
              participants: hero.participants,
            })}
          </div>
        </div>
        {hero.analyzed ? (
          <button
            type="button"
            className="ea-btn ea-btn-primary"
            onClick={() => onSelectEvent(hero.id)}
          >
            {t('event.overview.ranking.viewAnalysis')}
          </button>
        ) : (
          <button
            type="button"
            className="ea-btn ea-btn-primary"
            onClick={() => onGenerate(hero.id)}
            disabled={generatingId === hero.id}
          >
            <Sparkles size={13} /> {t('event.overview.ranking.createHero')}
          </button>
        )}
      </div>

      <div className="ea-ov-rank-list">
        {shown.map((e, i) => (
          <div
            key={e.id}
            className="ea-ov-rank-row"
            role="button"
            tabIndex={0}
            onClick={() => onSelectEvent(e.id)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onSelectEvent(e.id);
              }
            }}
          >
            <span className="ea-ov-rank-n">{i + 2}</span>
            <span
              className={'ea-imp ' + importanceClass(e.importance)}
              title={importanceLabel(e.importance)}
            >
              {importanceAbbr(e.importance)}
            </span>
            <span className={'ea-ov-rank-name' + (e.analyzed ? '' : ' muted')}>{e.title}</span>
            {e.chapter !== null && (
              <span className="ea-ov-rank-ch">
                {t('event.list.chapterShort', { n: e.chapter })}
              </span>
            )}
            <div className="ea-ov-rank-bar-track">
              <div
                className={'ea-ov-rank-bar-fill' + (e.analyzed ? '' : ' muted')}
                style={{ width: `${(e.participants / maxParticipants) * 100}%` }}
              />
            </div>
            <span className="ea-ov-rank-count">
              {t('event.overview.ranking.participants', { count: e.participants })}
            </span>
            {!e.analyzed && (
              <button
                type="button"
                className="ea-ov-rank-gen"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onGenerate(e.id);
                }}
                disabled={generatingId === e.id}
              >
                {generatingId === e.id ? '…' : t('generate')}
              </button>
            )}
          </div>
        ))}
      </div>

      {rest.length > DEFAULT_ROWS && (
        <button
          type="button"
          className="ea-btn ea-ov-expand-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {expanded
            ? t('event.overview.ranking.collapse')
            : t('event.overview.ranking.expand', { count: rest.length - DEFAULT_ROWS })}
        </button>
      )}
    </>
  );
}
