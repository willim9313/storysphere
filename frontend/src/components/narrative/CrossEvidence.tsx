// ③ Cross-evidence — the two blocks above, plus what the other analysis pages
// found, laid on one chapter axis. Everything here reuses existing endpoints.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HeroJourneyStage, KernelSpineEvent } from '@/api/narrative';
import type { StageTheory } from './heroJourney';
import { stageOrdinal } from './heroJourney';

interface CrossEvidenceProps {
  stages: HeroJourneyStage[];
  theory: Record<string, StageTheory>;
  kernelEvents: KernelSpineEvent[];
  /** Highest TEU intensity per chapter, keyed by chapter number. */
  tensionByChapter: Record<number, number>;
  teuCount: number;
  temporalAnalyzed: boolean;
  temporalStructure: string | null;
  temporalCoverage: number | null;
  temporalSufficient: boolean;
  chapterCount: number;
  bookId: string;
}

const PEAK_ROWS = 3;

export function CrossEvidence({
  stages,
  theory,
  kernelEvents,
  tensionByChapter,
  teuCount,
  temporalAnalyzed,
  temporalStructure,
  temporalCoverage,
  temporalSufficient,
  chapterCount,
  bookId,
}: CrossEvidenceProps) {
  const { t } = useTranslation('analysis');

  const { chapters, maxStages, maxKernel, lastKernelChapter } = useMemo(() => {
    const maxSeen = kernelEvents.reduce((m, e) => Math.max(m, e.chapter), 0);
    const n = Math.max(chapterCount, maxSeen, ...Object.keys(tensionByChapter).map(Number), 1);
    const rows = Array.from({ length: n }, (_, i) => {
      const ch = i + 1;
      const covering = stages.filter((s) => {
        const r = s.chapter_range;
        return r.length > 0 && r[0] <= ch && r[r.length - 1] >= ch;
      });
      const kernels = kernelEvents.filter((e) => e.chapter === ch);
      return { ch, covering, kernels, tension: tensionByChapter[ch] ?? 0 };
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
    const complete = [...chapters]
      .filter((c) => c.covering.length > 0 && c.kernels.length > 0 && c.tension > 0)
      .sort((a, b) => b.tension - a.tension)[0];
    const gap = chapters.find(
      (c) => c.kernels.length === 0 && (c.tension > 0 || c.covering.length > 0),
    );
    return { complete, gap };
  }, [chapters]);

  const peaks = useMemo(
    () =>
      [...chapters]
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
      value: (c: (typeof chapters)[number]) => c.covering.length / maxStages,
      raw: (c: (typeof chapters)[number]) => c.covering.length,
      color: 'var(--accent)',
    },
    {
      key: 'kernel',
      label: t('narrative.cross.rowKernel'),
      sub: t('narrative.cross.rowKernelSub', { n: kernelEvents.length }),
      value: (c: (typeof chapters)[number]) => c.kernels.length / maxKernel,
      raw: (c: (typeof chapters)[number]) => c.kernels.length,
      color: 'var(--symbol-density-mid)',
    },
    {
      key: 'tension',
      label: t('narrative.cross.rowTension'),
      sub: t('narrative.cross.rowTensionSub'),
      value: (c: (typeof chapters)[number]) => c.tension,
      raw: (c: (typeof chapters)[number]) => c.tension.toFixed(2),
      color: 'var(--tension-intensity-high-bg)',
    },
  ];

  return (
    <section className="nl-card" id="nl-cross">
      <div>
        <div className="nl-index-top" style={{ maxWidth: 240 }}>
          <span className="nl-index-n nl-index-n-ghost">3</span>
          <span className="nl-index-role">{t('narrative.index.role3')}</span>
        </div>
        <h2 style={{ margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--fg-primary)' }}>
          {t('narrative.cross.title')}
        </h2>
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', textWrap: 'pretty' }}>
          {t('narrative.cross.lead')}
        </p>
      </div>

      <div>
        {rows.map((row) => (
          <div key={row.key} className="nl-cross-row">
            <div className="nl-cross-label">
              <div className="nl-cross-label-t">{row.label}</div>
              <div className="nl-cross-label-s">{row.sub}</div>
            </div>
            <div className="nl-cross-cells" style={{ gridTemplateColumns: `repeat(${chapters.length}, 1fr)` }}>
              {chapters.map((c) => {
                const v = row.value(c);
                return (
                  <div
                    key={c.ch}
                    title={`${t('narrative.spine.chapterUnit', { ch: c.ch })} · ${row.raw(c)}`}
                    style={{
                      height: v > 0 ? `${Math.max(10, Math.round(v * 100))}%` : 3,
                      background: v > 0 ? row.color : 'transparent',
                      border: `1px ${v > 0 ? 'solid' : 'dashed'} var(--border)`,
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className="nl-cross-row">
          <div />
          <div className="nl-cross-ruler" style={{ gridTemplateColumns: `repeat(${chapters.length}, 1fr)` }}>
            {chapters.map((c) => (
              <div key={c.ch}>{c.ch}</div>
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
              {reading.gap
                ? ' ' +
                  t('narrative.cross.noteGap', {
                    ch: reading.gap.ch,
                    last: lastKernelChapter,
                  })
                : ''}
            </p>
          </div>
        )}
      </div>

      <div className="nl-cross-split">
        <div>
          <div className="nl-cross-head">
            <h3>{t('narrative.cross.temporalTitle')}</h3>
            <span className="nl-cross-sub">{t('narrative.cross.temporalSub')}</span>
            <span className={temporalAnalyzed ? 'nl-cross-badge' : 'nl-cross-badge is-pending'}>
              {temporalAnalyzed ? t('narrative.cross.analyzed') : t('narrative.cross.notAnalyzed')}
            </span>
          </div>
          {temporalAnalyzed && temporalStructure ? (
            <p className="nl-cross-body">
              {t('narrative.cross.temporalResult', {
                structure: t(`narrative.cross.structure.${temporalStructure}`, { defaultValue: temporalStructure }),
              })}
            </p>
          ) : (
            <>
              <div className="nl-cross-ghost" style={{ gridTemplateColumns: `repeat(${chapters.length}, 1fr)` }}>
                {chapters.map((c) => (
                  <div key={c.ch} />
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
          <Link className="nl-cross-link" to={`/books/${bookId}/timeline`}>
            {t('narrative.cross.temporalLink')}
          </Link>
        </div>

        <div className="nl-cross-right">
          <div className="nl-cross-head">
            <h3>{t('narrative.cross.tensionTitle')}</h3>
            <span className="nl-cross-sub">{t('narrative.cross.tensionSub')}</span>
            <span className={teuCount > 0 ? 'nl-cross-badge' : 'nl-cross-badge is-pending'}>
              {teuCount > 0
                ? t('narrative.cross.teuCount', { n: teuCount })
                : t('narrative.cross.notAnalyzed')}
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
