import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIntensity, relativeIntensity } from './intensity';
import type { TensionLineDetail } from './reviewTypes';
import type { components } from '@/api/generated';

type TEUDetail = components['schemas']['TEUDetail'];

/** Bar height in px for a TEU of this intensity, per the design. */
function barHeight(intensity: number): number {
  return Math.round(8 + intensity * 24);
}

interface Props {
  lines: TensionLineDetail[];
  teus: TEUDetail[];
  openId: string | null;
  onOpen: (lineId: string) => void;
  onAssign: (teuId: string, lineId: string) => void;
}

/**
 * One row per line, one column per chapter, one bar per TEU.
 *
 * This replaces the trajectory chart, which encoded a line's chapter span as a
 * solid bar between `chapter_range`'s endpoints — claiming coverage of every
 * chapter in between, and degenerating to a stub whenever a line sat in a
 * single chapter (four of five did, on real output).
 *
 * The last row is the TEUs no line claimed. It is not a footnote: grouping
 * dropped 42% of them on the real book, including whole chapters, and until
 * this row existed there was nothing anywhere in the UI that said so.
 */
export function TensionChapterGrid({ lines, teus, openId, onOpen, onAssign }: Props) {
  const { t } = useTranslation('analysis');
  const [orphansOpen, setOrphansOpen] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  // Chapters come from the TEUs, not the lines: a chapter whose every TEU was
  // dropped still exists in the book and must still get a column.
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
  // Chapters where every single TEU was dropped — the most damaging case, since
  // the chapter vanishes from the analysis entirely.
  const lostChapters = orphanChapters.filter(
    (ch) => !teus.some((teu) => teu.chapter === ch && teu.line_id != null),
  );

  // Column widths come from CSS custom properties so the responsive rules live in
  // tension.css. The cell floor is what makes `overflow-x: auto` on .tn-grid actually
  // fire: a bare `1fr` is `minmax(auto, 1fr)`, which lets long books squeeze columns
  // down to the bars instead of scrolling.
  // The bars inside a cell are aria-hidden decoration, so the cell's own label is
  // the only place their intensity survives. Enumerated rather than aggregated:
  // one band per bar, matching what a sighted reader counts in the cell. Empty
  // cells fall back to the plain label so nothing announces a dangling "強度".
  const cellLabel = (key: string, chapter: number, cellTeus: { intensity: number }[]) => {
    if (cellTeus.length === 0) return t(key, { chapter, count: 0 });
    const bands = cellTeus.map((teu) => {
      const bucket = scale(teu.intensity).bucket;
      return t(`tension.table.band${bucket[0].toUpperCase()}${bucket.slice(1)}`);
    });
    return t(`${key}Intensity`, {
      chapter,
      count: cellTeus.length,
      // A speech-only string, so this is a spoken separator, not the design's
      // visual interpunct.
      intensities: bands.join(t('tension.grid.intensitySep')),
    });
  };

  const gridStyle = {
    gridTemplateColumns: `var(--tn-grid-label-w) repeat(${Math.max(maxChapter, 1)}, minmax(var(--tn-grid-cell-w), 1fr))`,
  };

  return (
    <section className="tn-grid-card">
      <header className="tn-grid-head">
        <div className="tn-grid-title-wrap">
          <span className="tn-grid-title">{t('tension.grid.title')}</span>
          <span className="tn-grid-meta">
            {t('tension.grid.meta', { lines: lines.length, covered, total: teus.length })}
          </span>
        </div>
        <div className="tn-grid-legend">
          <span className="tn-grid-legend-label">{t('tension.grid.legendLabel')}</span>
          <span className="tn-legend-item">
            <i data-band="low" style={{ height: 9 }} />
            {t('tension.table.bandLow')}
          </span>
          <span className="tn-legend-item">
            <i data-band="mid" style={{ height: 14 }} />
            {t('tension.table.bandMid')}
          </span>
          <span className="tn-legend-item">
            <i data-band="high" style={{ height: 19 }} />
            {t('tension.table.bandHigh')}
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
                  <span className="tn-status-badge sm" data-s={line.review_status}>
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
                      <i
                        key={teu.id}
                        aria-hidden="true"
                        data-band={scale(teu.intensity).bucket}
                        style={{ height: `${barHeight(teu.intensity)}px` }}
                      />
                    ))}
                  </button>
                );
              })}
            </div>
          );
        })}

        <div className="tn-grid-rowgroup orphan">
          <button
            type="button"
            className="tn-grid-rowlabel"
            onClick={() => setOrphansOpen((v) => !v)}
            aria-expanded={orphansOpen}
          >
            <span className="tn-grid-orphan-title">
              {t('tension.grid.orphanTitle')}
              <span className="tn-grid-orphan-toggle">
                {orphansOpen ? t('tension.grid.collapse') : t('tension.grid.expand')}
              </span>
            </span>
            <span className="tn-grid-orphan-meta">
              {t('tension.grid.orphanMeta', { count: orphans.length, pct: orphanPct })}
              {lostChapters.length > 0 &&
                ` · ${t('tension.grid.lostChapters', { list: lostChapters.map((c) => `ch${c}`).join(' · ') })}`}
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
              {cellOrphans
                .map((o) => (
                  <i key={o.id} aria-hidden="true" data-orphan="true" style={{ height: `${barHeight(o.intensity)}px` }} />
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
            <span className="tn-grid-meta">{t('tension.grid.orphanListSub')}</span>
          </div>
          {[...orphans]
            .sort((a, b) => b.intensity - a.intensity)
            .map((teu) => {
              const band = scale(teu.intensity);
              return (
                <div key={teu.id} className="tn-orphan-row" data-strong={teu.intensity >= 0.9}>
                  <span className="tn-orphan-ch">{t('tension.drawer.chapter', { n: teu.chapter })}</span>
                  <span className="tn-orphan-poles">
                    {teu.pole_a_concept}
                    <span className="tn-vs">vs</span>
                    {teu.pole_b_concept}
                  </span>
                  <span className="tn-orphan-intensity">
                    <i className="tn-bar sm">
                      <i
                        className="tn-bar-fill"
                        data-band={band.bucket}
                        style={{ width: `${band.widthPct}%` }}
                      />
                    </i>
                    <span className="tn-bar-value">{formatIntensity(teu.intensity)}</span>
                  </span>
                  {assigning === teu.id ? (
                    <select
                      className="tn-orphan-select"
                      autoFocus
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) onAssign(teu.id, e.target.value);
                        setAssigning(null);
                      }}
                      onBlur={() => setAssigning(null)}
                    >
                      <option value="" disabled>
                        {t('tension.grid.pickLine')}
                      </option>
                      {lines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.canonical_pole_a} / {line.canonical_pole_b}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      className="tn-act-ghost"
                      onClick={() => setAssigning(teu.id)}
                      disabled={lines.length === 0}
                    >
                      {t('tension.grid.assign')}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}
