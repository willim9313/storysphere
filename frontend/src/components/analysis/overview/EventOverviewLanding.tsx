import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnalysisListResponse } from '@/api/types';
import { useTimeline } from '@/hooks/useTimeline';

type Importance = 'KERNEL' | 'SATELLITE' | null;

interface OverviewEvent {
  id: string;
  title: string;
  chapter: number | null;
  importance: Importance;
  analyzed: boolean;
  participants: number;
}

interface EventOverviewLandingProps {
  bookId: string;
  evtData: AnalysisListResponse;
  onSelectEvent: (id: string) => void;
  onGenerate: (id: string) => void;
  generatingId: string | null;
  onBatchAll: () => void;
  isBatchRunning: boolean;
}

const DEFAULT_ROWS = 11;

// KERNEL first, then SATELLITE, then events whose importance is still
// undetermined — the backend only fills `importance` once an EEP exists, so
// every unanalyzed event lands in the last bucket.
function importanceRank(importance: Importance): number {
  if (importance === 'KERNEL') return 2;
  if (importance === 'SATELLITE') return 1;
  return 0;
}

function importanceClass(importance: Importance): string {
  if (importance === 'KERNEL') return 'kernel';
  if (importance === 'SATELLITE') return 'satellite';
  return 'unknown';
}

export function EventOverviewLanding({
  bookId,
  evtData,
  onSelectEvent,
  onGenerate,
  generatingId,
  onBatchAll,
  isBatchRunning,
}: Readonly<EventOverviewLandingProps>) {
  const { t } = useTranslation('analysis');
  const [expanded, setExpanded] = useState(false);

  // #13a carries every event's participant list in one call, so the ranking
  // does not need a per-event detail fetch.
  const { data: timeline } = useTimeline(bookId, 'narrative');

  const events = useMemo<OverviewEvent[]>(() => {
    const participantCount = new Map<string, number>(
      (timeline?.events ?? []).map((e) => [e.id, e.participants.length]),
    );
    const analyzed: OverviewEvent[] = evtData.analyzed.map((a) => ({
      id: a.entityId,
      title: a.title,
      chapter: a.chapter ?? null,
      importance: (a.importance ?? null) as Importance,
      analyzed: true,
      participants: participantCount.get(a.entityId) ?? 0,
    }));
    const unanalyzed: OverviewEvent[] = evtData.unanalyzed.map((u) => ({
      id: u.id,
      title: u.name,
      chapter: u.chapter ?? null,
      importance: (u.importance ?? null) as Importance,
      analyzed: false,
      participants: participantCount.get(u.id) ?? 0,
    }));
    return [...analyzed, ...unanalyzed].sort(
      (a, b) =>
        importanceRank(b.importance) - importanceRank(a.importance) ||
        b.participants - a.participants ||
        (a.chapter ?? Infinity) - (b.chapter ?? Infinity),
    );
  }, [evtData, timeline]);

  const analyzedCount = evtData.analyzed.length;
  const unanalyzedCount = evtData.unanalyzed.length;
  const totalCount = analyzedCount + unanalyzedCount;
  const kernelCount = events.filter((e) => e.importance === 'KERNEL').length;

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
  const rest = events.slice(1);
  const shown = expanded ? rest : rest.slice(0, DEFAULT_ROWS);
  const maxParticipants = Math.max(1, ...events.map((e) => e.participants));

  return (
    <div className="ea-ov-landing">
      {analyzedCount === 0 && (
        <div className="ea-ov-empty-banner">
          <div className="ea-ov-empty-text">
            <strong>{t('event.overview.emptyLead')}</strong> {t('event.overview.emptyBody')}
          </div>
          <button
            type="button"
            className="ea-btn ea-btn-primary"
            onClick={onBatchAll}
            disabled={isBatchRunning}
          >
            <Sparkles size={12} /> {t('event.overview.emptyBatch')}
          </button>
        </div>
      )}

      <div className="ea-ov-head">
        <h1 className="ea-ov-title">{t('event.overview.title')}</h1>
        <div className="ea-ov-meta">
          <span>
            <strong>{totalCount}</strong> {t('event.overview.metaTotal')}
          </span>
          <span className="ea-ov-meta-item analyzed">
            <span className="ea-ov-meta-dot" /> {t('event.overview.metaAnalyzed')} {analyzedCount}
          </span>
          <span className="ea-ov-meta-item">
            <span className="ea-ov-meta-dot empty" /> {t('event.overview.metaUnanalyzed')}{' '}
            {unanalyzedCount}
          </span>
          <span className="ea-ov-meta-item kernel">
            {t('event.overview.metaKernel')} {kernelCount}
          </span>
        </div>
      </div>

      {hero && (
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
      )}
    </div>
  );
}
