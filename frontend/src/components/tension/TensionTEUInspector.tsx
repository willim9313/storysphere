import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import { formatIntensity, relativeIntensity } from './intensity';
import type { TensionLineDetail } from './reviewTypes';
import type { components } from '@/api/generated';

type TEUDetail = components['schemas']['TEUDetail'];
type Carrier = NonNullable<TEUDetail['pole_a_carriers']>[number];

interface Props {
  teus: TEUDetail[];
  lines: TensionLineDetail[];
  onAssign: (teuId: string, lineId: string) => void;
  onOpenChapter: (chapter: number) => void;
}

/**
 * Step 1's raw output, chapter by chapter.
 *
 * This is the audit view: the grid says *how many* TEUs grouping dropped, this
 * says *which ones and what they contained*. Without it a user can see that 42%
 * of the analysis went missing but never find out whether the missing part
 * mattered.
 */
export function TensionTEUInspector({ teus, lines, onAssign, onOpenChapter }: Props) {
  const { t } = useTranslation('analysis');
  const [openChapters, setOpenChapters] = useState<Set<number>>(new Set());
  const [onlyOrphans, setOnlyOrphans] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const scale = relativeIntensity(teus.map((teu) => teu.intensity));
  const lineLabel = new Map(lines.map((l) => [l.id, `${l.canonical_pole_a} / ${l.canonical_pole_b}`]));

  const visible = onlyOrphans ? teus.filter((teu) => teu.line_id == null) : teus;
  const chapters = [...new Set(visible.map((teu) => teu.chapter))].sort((a, b) => a - b);
  const orphanTotal = teus.filter((teu) => teu.line_id == null).length;
  const allOpen = chapters.length > 0 && chapters.every((ch) => openChapters.has(ch));

  return (
    <div className="tn-teu-mode">
      <div className="tn-toolbar">
        <span className="tn-teu-meta">
          {t('tension.teu.meta', {
            total: teus.length,
            covered: teus.length - orphanTotal,
            lines: lines.length,
            orphans: orphanTotal,
          })}
        </span>
        <span className="tn-toolbar-spacer" />
        <button
          type="button"
          className="tn-teu-filter"
          aria-pressed={onlyOrphans}
          onClick={() => setOnlyOrphans((v) => !v)}
        >
          <i aria-hidden="true" />
          {t('tension.teu.onlyOrphans')}
        </button>
        <button
          type="button"
          className="tn-sort-btn"
          onClick={() => setOpenChapters(allOpen ? new Set() : new Set(chapters))}
        >
          {allOpen ? t('tension.teu.collapseAll') : t('tension.teu.expandAll')}
        </button>
      </div>

      {chapters.map((chapter) => {
        const items = visible.filter((teu) => teu.chapter === chapter);
        const orphansHere = items.filter((teu) => teu.line_id == null).length;
        const open = openChapters.has(chapter);
        return (
          <section key={chapter} className="tn-teu-chapter">
            <button
              type="button"
              className="tn-teu-chapter-head"
              data-open={open}
              aria-expanded={open}
              onClick={() =>
                setOpenChapters((prev) => {
                  const next = new Set(prev);
                  if (next.has(chapter)) next.delete(chapter);
                  else next.add(chapter);
                  return next;
                })
              }
            >
              <span className="tn-teu-ch-label">{t('tension.drawer.chapter', { n: chapter })}</span>
              <span className="tn-teu-ch-count">{t('tension.teu.count', { count: items.length })}</span>
              {/* Decorative preview: expanding the chapter lists every TEU's
                  intensity as text, so announcing the bars here would read the
                  same values twice. */}
              <span className="tn-teu-mini" aria-hidden="true">
                {items.map((teu) => (
                  <i
                    key={teu.id}
                    data-band={scale(teu.intensity).bucket}
                    data-orphan={teu.line_id == null}
                    style={{ height: `${Math.round((8 + teu.intensity * 24) * 0.55)}px` }}
                  />
                ))}
              </span>
              <span className="tn-teu-ch-note" data-warn={orphansHere > 0}>
                {orphansHere === items.length
                  ? t('tension.teu.allOrphan')
                  : orphansHere > 0
                    ? t('tension.teu.someOrphan', { count: orphansHere })
                    : t('tension.teu.noneOrphan')}
              </span>
              <span className="tn-toolbar-spacer" />
              <span className="tn-teu-ch-toggle">
                {open ? t('tension.grid.collapse') : t('tension.grid.expand')}
              </span>
            </button>

            {open && (
              <div className="tn-teu-grid">
                {items.map((teu) => {
                  const orphan = teu.line_id == null;
                  const band = scale(teu.intensity);
                  const quote = (teu.evidence ?? [])[0];
                  return (
                    <article key={teu.id} className="tn-teu-card" data-orphan={orphan}>
                      <div className="tn-teu-card-top">
                        <i className="tn-bar md" aria-hidden="true">
                          <i
                            className="tn-bar-fill"
                            data-band={band.bucket}
                            style={{ width: `${band.widthPct}%` }}
                          />
                        </i>
                        <span className="tn-bar-value">{formatIntensity(teu.intensity)}</span>
                        <span className="tn-toolbar-spacer" />
                        <span className="tn-teu-source" data-orphan={orphan}>
                          {orphan
                            ? t('tension.teu.orphanBadge')
                            : (lineLabel.get(teu.line_id!) ?? t('tension.teu.orphanBadge'))}
                        </span>
                      </div>

                      <div className="tn-teu-poles">
                        {teu.pole_a_concept}
                        <span className="tn-vs">vs</span>
                        {teu.pole_b_concept}
                      </div>
                      <p className="tn-teu-summary">{teu.tension_description}</p>
                      {quote && <blockquote className="tn-ev-quote">{quote}</blockquote>}

                      <CarrierRow label="A" carriers={teu.pole_a_carriers ?? []} />
                      <CarrierRow label="B" carriers={teu.pole_b_carriers ?? []} />

                      <div className="tn-teu-card-foot">
                        <button
                          type="button"
                          className="tn-link-btn inline"
                          onClick={() => onOpenChapter(teu.chapter)}
                        >
                          {t('tension.drawer.backToText', { n: teu.chapter })}
                          <ArrowUpRight size={12} />
                        </button>
                        <span className="tn-toolbar-spacer" />
                        {orphan &&
                          (assigning === teu.id ? (
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
                          ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {chapters.length === 0 && <div className="tn-table-empty">{t('tension.teu.noneMatch')}</div>}
    </div>
  );
}

function CarrierRow({ label, carriers }: { label: string; carriers: Carrier[] }) {
  if (carriers.length === 0) return null;
  return (
    <div className="tn-teu-carriers">
      <span className="tn-teu-carrier-label">{label}</span>
      {carriers.map((c) => (
        <span key={`${label}-${c.name}`} className="tn-pill" data-t={c.entity_type ?? 'other'}>
          <span className="tn-pill-dot" />
          {c.name}
        </span>
      ))}
    </div>
  );
}
