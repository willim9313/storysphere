import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import { importanceClass, type Importance, type OverviewEvent } from './eventTypes';

interface EventRankingViewProps {
  events: OverviewEvent[];
  onSelectEvent: (id: string) => void;
  onGenerate: (id: string) => void;
  generatingId: string | null;
  /** Why no new generation can start right now (another event is generating,
   *  or a batch is running), shown as the disabled button's tooltip; null = free. */
  generateBlockedReason?: string | null;
}

const DEFAULT_ROWS = 11;

export function EventRankingView({
  events,
  onSelectEvent,
  onGenerate,
  generatingId,
  generateBlockedReason = null,
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
    <div className="ea-ov-card">
      <div className={'ea-ov-hero' + (hero.analyzed ? ' is-analyzed' : '')}>
        <span className="ea-ov-hero-rank">#1</span>
        <div className="ea-ov-hero-body">
          <div className="ea-ov-hero-title">
            <Tooltip label={importanceLabel(hero.importance)}>
              <span className={'ea-imp is-sm ' + importanceClass(hero.importance)}>
                {importanceAbbr(hero.importance)}
              </span>
            </Tooltip>
            <span className="ea-ov-hero-name">{hero.title}</span>
          </div>
          <div className="ea-ov-hero-sub">
            {t(
              hero.analyzed
                ? 'event.overview.ranking.heroSubAnalyzed'
                : 'event.overview.ranking.heroSub',
              {
                chapter: hero.chapter ?? '—',
                importance: importanceLabel(hero.importance),
                participants: hero.participants,
              },
            )}
          </div>
        </div>
        {hero.analyzed ? (
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary"
            onClick={() => onSelectEvent(hero.id)}
          >
            {t('event.overview.ranking.viewAnalysis')}
          </button>
        ) : (
          <Tooltip label={generateBlockedReason ?? ''} disabled={!generateBlockedReason}>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
              onClick={() => onGenerate(hero.id)}
              disabled={generatingId === hero.id || !!generateBlockedReason}
            >
              {t('event.overview.ranking.createHero')}
            </button>
          </Tooltip>
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
            <span className="ea-ov-rank-n">#{i + 2}</span>
            <Tooltip label={importanceLabel(e.importance)}>
              <span className={'ea-imp is-sm ' + importanceClass(e.importance)}>
                {importanceAbbr(e.importance)}
              </span>
            </Tooltip>
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
              <Tooltip
                label={generateBlockedReason ?? ''}
                disabled={!generateBlockedReason || generatingId === e.id}
              >
                <button
                  type="button"
                  className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onGenerate(e.id);
                  }}
                  disabled={generatingId === e.id || !!generateBlockedReason}
                >
                  {generatingId === e.id ? '…' : t('generate')}
                </button>
              </Tooltip>
            )}
          </div>
        ))}
      </div>

      {rest.length > DEFAULT_ROWS && (
        <button
          type="button"
          className="ea-ov-expand-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t('event.overview.ranking.collapse')
            : t('event.overview.ranking.expand', { count: rest.length - DEFAULT_ROWS })}
        </button>
      )}

      <p className="ea-ov-caption">{t('event.overview.ranking.caption')}</p>
    </div>
  );
}
