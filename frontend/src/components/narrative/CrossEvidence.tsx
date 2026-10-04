// ③ Cross-evidence — the two blocks above, plus what the other analysis pages
// found, laid on one chapter axis. Everything here reuses existing endpoints,
// and draws only what the data has: an empty chapter is an empty cell.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HeroJourneyStage, KernelSpineEvent } from '@/api/narrative';
import { Tooltip } from '@/components/ui/Tooltip';
import type { StageTheory } from './heroJourney';
import { stageOrdinal } from './heroJourney';
import { normalizeChapters } from './narrativeModel';

interface CrossEvidenceProps {
  stages: HeroJourneyStage[];
  theory: Record<string, StageTheory>;
  kernelEvents: KernelSpineEvent[];
  /** Highest TEU intensity per chapter, keyed by chapter number. */
  tensionByChapter: Record<number, number>;
  teuCount: number;
  temporalAnalyzed: boolean;
  temporalStructure: string | null;
  /** Analepsis / prolepsis verdict counts from the timeline payload. */
  displacement: { analepsis: number; prolepsis: number };
  temporalCoverage: number | null;
  temporalSufficient: boolean;
  chapterCount: number;
  bookId: string;
}

const PEAK_ROWS = 3;

interface Row {
  ch: number;
  covering: HeroJourneyStage[];
  kernels: KernelSpineEvent[];
  tension: number;
}

export function CrossEvidence({
  stages,
  theory,
  kernelEvents,
  tensionByChapter,
  teuCount,
  temporalAnalyzed,
  temporalStructure,
  displacement,
  temporalCoverage,
  temporalSufficient,
  chapterCount,
  bookId,
}: Readonly<CrossEvidenceProps>) {
  const { t } = useTranslation('analysis');

  const { chapters, maxStages, maxKernel, lastKernelChapter } = useMemo(() => {
    const maxSeen = kernelEvents.reduce((m, e) => Math.max(m, e.chapter), 0);
    const n = Math.max(chapterCount, maxSeen, ...Object.keys(tensionByChapter).map(Number), 1);
    // Only the chapters a stage really has — 1、2、5、8 does not cover 3 or 4.
    const sets = stages.map((s) => ({ s, ch: new Set(normalizeChapters(s.chapter_range)) }));
    const rows: Row[] = Array.from({ length: n }, (_, i) => {
      const ch = i + 1;
      return {
        ch,
        covering: sets.filter((x) => x.ch.has(ch)).map((x) => x.s),
        kernels: kernelEvents.filter((e) => e.chapter === ch),
        tension: tensionByChapter[ch] ?? 0,
      };
    });
    return {
      chapters: rows,
      maxStages: Math.max(1, ...rows.map((r) => r.covering.length)),
      maxKernel: Math.max(1, ...rows.map((r) => r.kernels.length)),
      lastKernelChapter: maxSeen,
    };
  }, [stages, kernelEvents, tensionByChapter, chapterCount]);

  const stageName = (s: HeroJourneyStage) => theory[s.stage_id]?.name ?? s.stage_name;

  // Read off the axis rather than asserting anything: the chapter where all
  // three layers are present at once, and one that carries only some of them.
  const reading = useMemo(() => {
    const complete = chapters
      .filter((c) => c.covering.length > 0 && c.kernels.length > 0 && c.tension > 0)
      .sort((a, b) => b.tension - a.tension)[0];
    const gap = chapters.find((c) => c.kernels.length === 0 && (c.tension > 0 || c.covering.length > 0));
    return { complete, gap };
  }, [chapters]);

  const peaks = useMemo(
    () =>
      chapters
        .filter((c) => c.tension > 0)
        .sort((a, b) => b.tension - a.tension || a.ch - b.ch)
        .slice(0, PEAK_ROWS),
    [chapters],
  );

  const rows = [
    {
      key: 'stages',
      label: t('narrative.cross.rowStages'),
      sub: t('narrative.cross.rowStagesSub', { n: maxStages }),
      value: (c: Row) => c.covering.length / maxStages,
      raw: (c: Row) => String(c.covering.length),
    },
    {
      key: 'kernel',
      label: t('narrative.cross.rowKernel'),
      sub: t('narrative.cross.rowKernelSub', { n: kernelEvents.length }),
      value: (c: Row) => c.kernels.length / maxKernel,
      raw: (c: Row) => String(c.kernels.length),
    },
    {
      key: 'tension',
      label: t('narrative.cross.rowTension'),
      sub: t('narrative.cross.rowTensionSub'),
      value: (c: Row) => c.tension,
      raw: (c: Row) => c.tension.toFixed(2),
    },
  ];

  const colStyle = { gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))` };

  return (
    <section className="nl-card" id="nl-cross">
      <div className="nl-cross-head0">
        <div className="nl-index-top">
          <span className="nl-index-n nl-index-n-ghost">3</span>
          <span className="nl-index-role">{t('narrative.index.role3')}</span>
        </div>
        <h2 className="nl-h2">{t('narrative.cross.title')}</h2>
        <p className="nl-lead">{t('narrative.cross.lead')}</p>
      </div>

      <div className="nl-cross-axis">
        {rows.map((row) => (
          <div key={row.key} className="nl-cross-row">
            <div className="nl-cross-label">
              <span className="nl-cross-label-t">{row.label}</span>
              <span className="nl-cross-label-s">{row.sub}</span>
            </div>
            <div className="nl-cross-cells" style={colStyle}>
              {chapters.map((c) => {
                const v = row.value(c);
                return (
                  <Tooltip key={c.ch} label={`${t('narrative.spine.chapterUnit', { ch: c.ch })} · ${row.raw(c)}`}>
                    <span
                      className={`nl-cross-cell is-${row.key}${v > 0 ? '' : ' is-empty'}`}
                      style={v > 0 ? { height: `${Math.max(10, Math.round(v * 100))}%` } : undefined}
                    />
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
        <div className="nl-cross-row">
          <span />
          <div className="nl-cross-ruler" style={colStyle}>
            {chapters.map((c) => (
              <span key={c.ch}>{c.ch}</span>
            ))}
          </div>
        </div>

        {reading.complete && (
          <div className="nl-cross-note">
            <span className="nl-cross-note-mark">↳</span>
            <p>
              {t('narrative.cross.notePeak', {
                ch: reading.complete.ch,
                tension: reading.complete.tension.toFixed(2),
                stages: reading.complete.covering.map((s) => stageOrdinal(s.stage_id)).join('、'),
                kernels: reading.complete.kernels.length,
              })}
              {reading.gap ? ' ' + t('narrative.cross.noteGap', { ch: reading.gap.ch, last: lastKernelChapter }) : ''}
            </p>
          </div>
        )}
      </div>

      <div className="nl-cross-split">
        <div className="nl-cross-col">
          <div className="nl-cross-head">
            <h3>{t('narrative.cross.temporalTitle')}</h3>
            {/* The framework name doubles as the way out to its full description. */}
            <Link className="nl-cross-sub nl-term-link" to="/methodology?framework=genette_temporal_order">
              {t('narrative.cross.temporalSub')}
            </Link>
            <span className={temporalAnalyzed ? 'ss-badge nl-badge-quiet' : 'ss-badge nl-badge-absent'}>
              {temporalAnalyzed ? t('narrative.cross.analyzed') : t('narrative.cross.notAnalyzed')}
            </span>
          </div>
          {temporalAnalyzed && temporalStructure ? (
            <>
              <p className="nl-cross-body">
                {t('narrative.cross.temporalResult', {
                  structure: t(`narrative.cross.structure.${temporalStructure}`, { defaultValue: temporalStructure }),
                })}
              </p>
              <div className="nl-cross-meta">{t('timeline.action.displacementDone', displacement)}</div>
            </>
          ) : (
            <>
              <div className="nl-cross-ghost" style={colStyle}>
                {chapters.map((c) => (
                  <span key={c.ch} />
                ))}
              </div>
              <p className="nl-cross-body">{t('narrative.cross.temporalPending')}</p>
            </>
          )}
          {temporalCoverage != null && (
            <div className="nl-cross-meta">
              {temporalSufficient
                ? t('narrative.cross.coverageOk', { pct: Math.round(temporalCoverage * 100) })
                : t('narrative.cross.coverageLow', { pct: Math.round(temporalCoverage * 100) })}
            </div>
          )}
          {!temporalAnalyzed && (
            <Link className="nl-cross-link" to={`/books/${bookId}/timeline`}>
              {t('narrative.cross.temporalLink')}
            </Link>
          )}
        </div>

        <div className="nl-cross-col">
          <div className="nl-cross-head">
            <h3>{t('narrative.cross.tensionTitle')}</h3>
            <span className="nl-cross-sub">{t('narrative.cross.tensionSub')}</span>
            <span className={teuCount > 0 ? 'ss-badge nl-badge-quiet' : 'ss-badge nl-badge-absent'}>
              {teuCount > 0 ? t('narrative.cross.teuCount', { n: teuCount }) : t('narrative.cross.notAnalyzed')}
            </span>
          </div>
          {peaks.length > 0 ? (
            <div className="nl-cross-peaks">
              {peaks.map((p) => (
                <div key={p.ch} className="nl-cross-peak">
                  <span className="nl-cross-peak-ch">{t('narrative.spine.chapterUnit', { ch: p.ch })}</span>
                  <span className="nl-cross-peak-v">{p.tension.toFixed(2)}</span>
                  <span className="nl-cross-peak-note">
                    {p.covering.length > 0
                      ? p.covering.map((s) => `${stageOrdinal(s.stage_id)} ${stageName(s)}`).join('、')
                      : t('narrative.cross.peakNoStage')}
                    {' · '}
                    {t('narrative.cross.peakKernel', { n: p.kernels.length })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="nl-cross-body">{t('narrative.cross.tensionPending')}</p>
          )}
          <Link className="nl-cross-link" to={`/books/${bookId}/tension`}>
            {t('narrative.cross.tensionLink')}
          </Link>
        </div>
      </div>
    </section>
  );
}
