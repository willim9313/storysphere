import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIntensity, relativeIntensity } from './intensity';
import { TensionAssignControl } from './TensionAssignControl';
import type { AssignApi, ReviewStatus, TensionLineDetail } from './reviewTypes';
import type { components } from '@/api/generated';

type TEUDetail = components['schemas']['TEUDetail'];

const BADGE: Record<ReviewStatus, string> = {
  pending: 'ss-badge-warning',
  approved: 'ss-badge-success',
  modified: 'ss-badge-info',
  rejected: 'ss-badge-error',
};

interface Props {
  lines: TensionLineDetail[];
  teus: TEUDetail[];
  openId: string | null;
  onOpen: (lineId: string) => void;
  assign: AssignApi;
}

/**
 * One row per line, one column per chapter, one bar per TEU (height + fill =
 * intensity). The last row is the TEUs no line claimed: hollow, solid-outlined
 * in the warning colour — "hollow" rather than a hue, so it survives Ink.
 */
export function TensionChapterGrid({ lines, teus, openId, onOpen, assign }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const [orphansOpen, setOrphansOpen] = useState(false);

  // Chapters come from the TEUs, not the lines: a chapter whose every TEU was
  // dropped still exists and must still get a column.
  const maxChapter = teus.reduce((m, teu) => Math.max(m, teu.chapter), 0);
  const chapters = Array.from({ length: maxChapter }, (_, i) => i + 1);
  const scale = relativeIntensity(teus.map((teu) => teu.intensity));

  const byLine = new Map<string, TEUDetail[]>();
  const orphans: TEUDetail[] = [];
  for (const teu of teus) {
    if (teu.line_id == null) orphans.push(teu);
    else {
      const list = byLine.get(teu.line_id);
      if (list) list.push(teu);
      else byLine.set(teu.line_id, [teu]);
    }
  }

  const covered = teus.length - orphans.length;
  const orphanPct = teus.length ? Math.round((orphans.length / teus.length) * 100) : 0;
  const orphanChapters = [...new Set(orphans.map((o) => o.chapter))].sort((a, b) => a - b);
  // Chapters where every TEU was dropped — the chapter vanishes from the analysis.
  const lostChapters = orphanChapters.filter(
    (ch) => !teus.some((teu) => teu.chapter === ch && teu.line_id != null),
  );

  // The bars are aria-hidden, so the cell label is the only place their
  // intensity survives. One band per bar, matching what a sighted reader counts.
  const cellLabel = (key: string, chapter: number, cellTeus: { intensity: number }[]) => {
    if (cellTeus.length === 0) return t(key, { chapter, count: 0 });
    const bands = cellTeus.map((teu) => {
      const bucket = scale(teu.intensity).bucket;
      return t(`tension.table.band${bucket[0].toUpperCase()}${bucket.slice(1)}`);
    });
    return t(`${key}Intensity`, {
      chapter,
      count: cellTeus.length,
      intensities: bands.join(t('tension.grid.intensitySep')),
    });
  };

  const gridStyle = {
    gridTemplateColumns: `var(--tn-grid-label-w) repeat(${Math.max(maxChapter, 1)}, minmax(var(--tn-grid-cell-w), 1fr))`,
  };

  return (
    <section className="tn-card tn-grid-card">
      <header className="tn-grid-head">
        <div className="tn-grid-title-wrap">
          <span className="tn-grid-title">{t('tension.grid.title')}</span>
          <span className="tn-hint">
            {t('tension.grid.meta', { lines: lines.length, covered, total: teus.length })}
          </span>
        </div>
        <div className="tn-grid-legend">
          <span>{t('tension.grid.legendLabel')}</span>
          <span className="tn-legend-item">
            <i data-band="low" />
            {t('tension.table.bandLow')}
          </span>
          <span className="tn-legend-item">
            <i data-band="mid" />
            {t('tension.table.bandMid')}
          </span>
          <span className="tn-legend-item">
            <i data-band="high" />
            {t('tension.table.bandHigh')}
          </span>
          <span className="tn-legend-item">
            <i data-orphan="true" />
            {t('tension.teu.orphanBadge')}
          </span>
          <span className="tn-grid-legend-note">{t('tension.grid.emptyCell')}</span>
        </div>
      </header>

      <div className="tn-grid" style={gridStyle}>
        <div className="tn-grid-corner">{t('tension.grid.axis')}</div>
        {chapters.map((ch) => (
          <div key={ch} className="tn-grid-colhead">
            {ch}
          </div>
        ))}

        {lines.map((line) => {
          const lineTeus = byLine.get(line.id) ?? [];
          return (
            <div key={line.id} className="tn-grid-rowgroup" data-open={line.id === openId}>
              <button type="button" className="tn-grid-rowlabel" onClick={() => onOpen(line.id)}>
                <span className="tn-grid-poles">
                  {line.canonical_pole_a}
                  <span className="tn-vs">vs</span>
                  {line.canonical_pole_b}
                </span>
                <span className="tn-grid-rowmeta">
                  <span>
                    {t('tension.grid.rowMeta', {
                      count: lineTeus.length,
                      intensity: formatIntensity(line.intensity_summary),
                    })}
                  </span>
                  <span className={`ss-badge ${BADGE[line.review_status]}`}>
                    {t(`tension.status.${line.review_status}`)}
                  </span>
                </span>
              </button>
              {chapters.map((ch) => {
                const cellTeus = lineTeus.filter((teu) => teu.chapter === ch);
                return (
                  <button
                    type="button"
                    key={ch}
                    className="tn-grid-cell"
                    onClick={() => onOpen(line.id)}
                    aria-label={cellLabel('tension.grid.cellLabel', ch, cellTeus)}
                  >
                    {cellTeus.map((teu) => (
                      <i key={teu.id} aria-hidden="true" data-band={scale(teu.intensity).bucket} />
                    ))}
                  </button>
                );
              })}
            </div>
          );
        })}

        <div className="tn-grid-rowgroup is-orphan">
          <button
            type="button"
            className="tn-grid-rowlabel"
            onClick={() => setOrphansOpen((v) => !v)}
            aria-expanded={orphansOpen}
          >
            <span className="tn-grid-orphan-title">{t('tension.grid.orphanTitle')}</span>
            <span className="tn-grid-rowmeta">
              <span className="tn-grid-orphan-meta">
                {t('tension.grid.orphanMeta', { count: orphans.length, pct: orphanPct })}
                {lostChapters.length > 0 &&
                  ` · ${t('tension.grid.lostChapters', { list: lostChapters.map((c) => `ch${c}`).join(' · ') })}`}
              </span>
              <span className="tn-grid-orphan-toggle">
                {orphansOpen ? t('tension.grid.collapse') : t('tension.grid.expand')}
              </span>
            </span>
          </button>
          {chapters.map((ch) => {
            const cellOrphans = orphans.filter((o) => o.chapter === ch);
            return (
              <button
                type="button"
                key={ch}
                className="tn-grid-cell"
                onClick={() => setOrphansOpen((v) => !v)}
                aria-label={cellLabel('tension.grid.orphanCellLabel', ch, cellOrphans)}
              >
                {cellOrphans.map((o) => (
                  <i key={o.id} aria-hidden="true" data-orphan="true" />
                ))}
              </button>
            );
          })}
        </div>
      </div>

      {orphansOpen && orphans.length > 0 && (
        <div className="tn-orphan-list">
          <div className="tn-orphan-list-head">
            <span className="tn-orphan-list-title">
              {t('tension.grid.orphanListTitle', { count: orphans.length })}
            </span>
            <span className="tn-hint">{t('tension.grid.orphanListSub')}</span>
          </div>
          {[...orphans]
            .sort((a, b) => b.intensity - a.intensity)
            .map((teu) => {
              const band = scale(teu.intensity);
              return (
                <div key={teu.id} className="tn-orphan-row">
                  <span className="tn-orphan-ch">{t('tension.drawer.chapter', { n: teu.chapter })}</span>
                  <span className="tn-orphan-poles">
                    {teu.pole_a_concept}
                    <span className="tn-vs">vs</span>
                    {teu.pole_b_concept}
                  </span>
                  <span className="tn-meta-mono">
                    {band.label} {t(`tension.table.band${band.bucket[0].toUpperCase()}${band.bucket.slice(1)}`)}
                  </span>
                  <TensionAssignControl teuId={teu.id} lines={lines} assign={assign} />
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}
