import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { relativeIntensity } from './intensity';
import { TensionAssignControl } from './TensionAssignControl';
import { chapterStatus } from './tensionModel';
import type { AssignApi, TensionLineDetail } from './reviewTypes';
import type { components } from '@/api/generated';

type TEUDetail = components['schemas']['TEUDetail'];
type Carrier = NonNullable<TEUDetail['pole_a_carriers']>[number];

interface Props {
  teus: TEUDetail[];
  lines: TensionLineDetail[];
  assign: AssignApi;
  onOpenChapter: (chapter: number) => void;
}

/** Bar height in px for a TEU of this intensity (mini bars in a chapter row). */
function miniHeight(intensity: number): number {
  return Math.round(8 + intensity * 12);
}

/**
 * Step 1's raw output, chapter by chapter, in one card of action rows.
 *
 * This is the audit view: the grid says how many TEUs grouping dropped, this
 * says which ones. Each row is lead (chapter) · body (mini bars + status) ·
 * trail (expand); a dropped count is warning-toned and "all covered" is muted.
 */
export function TensionTEUInspector({ teus, lines, assign, onOpenChapter }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const [openChapters, setOpenChapters] = useState<Set<number>>(new Set());
  const [onlyOrphans, setOnlyOrphans] = useState(false);

  const scale = relativeIntensity(teus.map((teu) => teu.intensity));
  const lineLabel = new Map(lines.map((l) => [l.id, `${l.canonical_pole_a} / ${l.canonical_pole_b}`]));

  const visible = onlyOrphans ? teus.filter((teu) => teu.line_id == null) : teus;
  const chapters = [...new Set(visible.map((teu) => teu.chapter))].sort((a, b) => a - b);
  const orphanTotal = teus.filter((teu) => teu.line_id == null).length;
  const allOpen = chapters.length > 0 && chapters.every((ch) => openChapters.has(ch));

  const toggle = (chapter: number) =>
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapter)) next.delete(chapter);
      else next.add(chapter);
      return next;
    });

  return (
    <div className="tn-card tn-teu-card">
      <div className="tn-card-bar">
        <span className="tn-teu-meta">
          {t('tension.teu.meta', {
            total: teus.length,
            covered: teus.length - orphanTotal,
            lines: lines.length,
            orphans: orphanTotal,
          })}
        </span>
        <span className="tn-spacer" />
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-secondary tn-toggle-btn"
          aria-pressed={onlyOrphans}
          onClick={() => setOnlyOrphans((v) => !v)}
        >
          {t('tension.teu.onlyOrphans')}
        </button>
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-ghost"
          onClick={() => setOpenChapters(allOpen ? new Set() : new Set(chapters))}
        >
          {allOpen ? t('tension.teu.collapseAll') : t('tension.teu.expandAll')}
        </button>
      </div>

      <div className="tn-teu-rows">
        {chapters.map((chapter) => {
          const items = visible.filter((teu) => teu.chapter === chapter);
          const orphansHere = items.filter((teu) => teu.line_id == null).length;
          const status = chapterStatus(items.length, orphansHere);
          const open = openChapters.has(chapter);
          return (
            <div key={chapter} className="tn-teu-chapter" data-open={open}>
              <button
                type="button"
                className="tn-teu-row"
                aria-expanded={open}
                onClick={() => toggle(chapter)}
              >
                <span className="tn-teu-ch">{t('tension.drawer.chapter', { n: chapter })}</span>
                <span className="tn-teu-n">{t('tension.teu.count', { count: items.length })}</span>
                {/* Decorative preview: expanding lists every TEU anyway. */}
                <span className="tn-teu-mini" aria-hidden="true">
                  {items.map((teu) => (
                    <i
                      key={teu.id}
                      data-band={scale(teu.intensity).bucket}
                      data-orphan={teu.line_id == null}
                      style={{ height: `${miniHeight(teu.intensity)}px` }}
                    />
                  ))}
                </span>
                <span className="tn-teu-status" data-warn={status.kind !== 'allCovered'}>
                  {status.kind === 'whole'
                    ? t('tension.teu.allOrphan')
                    : status.kind === 'some'
                      ? t('tension.teu.someOrphan', { count: status.orphans })
                      : t('tension.teu.noneOrphan')}
                </span>
                <span className="tn-teu-toggle">
                  {open ? t('tension.grid.collapse') : t('tension.grid.expand')}
                </span>
              </button>

              {open && (
                <div className="tn-teu-items">
                  {items.map((teu) => {
                    const orphan = teu.line_id == null;
                    const band = scale(teu.intensity);
                    const quote = (teu.evidence ?? [])[0];
                    return (
                      <article key={teu.id} className="tn-teu-item" data-orphan={orphan}>
                        <div className="tn-teu-item-top">
                          <i className="tn-bar-mark" data-band={band.bucket} data-orphan={orphan} aria-hidden="true" />
                          <span className="tn-teu-poles">
                            {teu.pole_a_concept}
                            <span className="tn-vs">vs</span>
                            {teu.pole_b_concept}
                          </span>
                          <span className="tn-meta-mono">
                            {band.label} {t(`tension.table.band${band.bucket[0].toUpperCase()}${band.bucket.slice(1)}`)}
                          </span>
                          <span className="tn-spacer" />
                          <span className="tn-teu-source" data-orphan={orphan}>
                            {orphan
                              ? t('tension.teu.orphanBadge')
                              : (lineLabel.get(teu.line_id!) ?? t('tension.teu.orphanBadge'))}
                          </span>
                        </div>
                        <p className="tn-teu-summary">{teu.tension_description}</p>
                        {quote && <p className="tn-quote">{quote}</p>}
                        <CarrierRow label="A" carriers={teu.pole_a_carriers ?? []} />
                        <CarrierRow label="B" carriers={teu.pole_b_carriers ?? []} />
                        <div className="tn-teu-item-foot">
                          <button
                            type="button"
                            className="ss-btn ss-btn-sm ss-btn-ghost"
                            onClick={() => onOpenChapter(teu.chapter)}
                          >
                            {t('tension.drawer.backToText', { n: teu.chapter })}
                          </button>
                          {orphan && <TensionAssignControl teuId={teu.id} lines={lines} assign={assign} />}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {chapters.length === 0 && <div className="tn-empty-line">{t('tension.teu.noneMatch')}</div>}
    </div>
  );
}

function CarrierRow({ label, carriers }: Readonly<{ label: string; carriers: Carrier[] }>) {
  if (carriers.length === 0) return null;
  return (
    <div className="tn-carriers">
      <span className="tn-chip-label">{label}</span>
      {carriers.map((c) => (
        <span key={`${label}-${c.name}`} className="tn-pill" data-t={c.entity_type ?? 'other'}>
          <span className="tn-pill-dot" />
          {c.name}
        </span>
      ))}
    </div>
  );
}
