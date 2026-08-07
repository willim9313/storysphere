import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ChapterAxis, ChapterSegment } from './chapterAxis';
import { TypePill } from './Badges';
import { densityLegendSteps, densityStep, typeStyle } from './tokens';
import { behaviourLine } from './symbolPhrases';
import {
  interpretationAdvice,
  rankSymbols,
  type DistributionShape,
  type SortAxis,
  type SymbolAnalysis,
  type SymbolSignals,
} from './symbolSignals';

/** Front and back matter read as narrower columns than the story itself. */
const OUTSIDE_CELL_FLEX = 0.7;

/** Below this, a symbol's evidence is partly front matter and is flagged as such. */
const TRUST_FLOOR = 0.8;

type Props = {
  analysis: SymbolAnalysis | null;
  /** Heatmap rows follow the sidebar's axis, so the two never disagree on order. */
  sortAxis: SortAxis;
  shapeFilter: DistributionShape | null;
  setShapeFilter: (v: DistributionShape | null) => void;
  onSelect: (id: string) => void;
};

/** Order groups by how much of a claim they make, not alphabetically. */
const SHAPE_ORDER: DistributionShape[] = [
  'through', 'backHalf', 'frontHalf', 'earlyExit', 'lateEntry', 'scatter', 'single', 'none',
];

/** Type size ramp for the tail cloud, in rem, matching the --font-size-* scale. */
const TAIL_MIN_REM = 0.75;
const TAIL_MAX_REM = 1.125;

/** How many recommendations fit before the reader is choosing from a list again. */
const PICK_COUNT = 3;

/**
 * What the book contains, and what it costs to learn more.
 *
 * Replaces four stat tiles, two of which read 0 on any book nobody has spent
 * tokens on — which is every book at first. The counts that matter are here as a
 * sentence, including the one the tiles never showed: how many symbols have
 * evidence partly drawn from front matter.
 */
function OverviewHeader({
  analysis,
  totalOccurrences,
}: Readonly<{ analysis: SymbolAnalysis | null; totalOccurrences: number }>) {
  const { t } = useTranslation('analysis');
  const all = analysis?.all ?? [];
  const total = all.length;
  const interpreted = all.filter((s) => s.hasInterpretation).length;
  const noisy = (analysis?.main ?? []).filter((s) => s.trust < TRUST_FLOOR).length;

  const meta = [
    t('symbol.overview.meta.symbols', { count: total }),
    t('symbol.overview.meta.occurrences', { count: totalOccurrences }),
    // Stated because it is the page's premise: ranking works before any token is
    // spent, so an empty interpretation count is not an empty page.
    t('symbol.overview.meta.signals', { count: total, total }),
    t('symbol.overview.meta.interpreted', { count: interpreted, total }),
  ];
  if (noisy > 0) meta.push(t('symbol.overview.meta.noisy', { count: noisy }));

  return (
    <header className="sym-ov-head">
      <h2 className="sym-ov-title">{t('symbol.overview.title')}</h2>
      <p className="sym-ov-meta">{meta.join(t('symbol.overview.meta.separator'))}</p>
      <p className="sym-ov-cost">
        <Sparkles size={12} aria-hidden="true" />
        {t('symbol.overview.aiCostLegend')}
      </p>
    </header>
  );
}

/**
 * The three symbols worth opening first.
 *
 * A ranked list still asks the reader to choose. These name the choice and say
 * why, so the page has an answer to "which one?" before anything is clicked.
 */
function StartHere({
  analysis,
  onSelect,
}: Readonly<{ analysis: SymbolAnalysis | null; onSelect: (id: string) => void }>) {
  const { t } = useTranslation('analysis');
  const picks = (analysis?.main ?? []).slice(0, PICK_COUNT);

  return (
    <section className="sym-dash-card">
      <div className="sym-dash-card-head">
        <span className="sym-dash-card-title">{t('symbol.overview.picks.title')}</span>
        <span className="sym-dash-card-meta">
          {t('symbol.overview.picks.subtitle', { count: picks.length })}
        </span>
      </div>
      {picks.length === 0 ? (
        <p className="sym-list-empty">{t('symbol.overview.picks.empty')}</p>
      ) : (
        <div className="sym-pick-grid">
          {picks.map((s, i) => (
            <PickCard
              key={s.id}
              signals={s}
              rank={i + 1}
              bodyChapters={analysis?.axis.bodyChapterCount ?? 0}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PickCard({
  signals,
  rank,
  bodyChapters,
  onSelect,
}: Readonly<{
  signals: SymbolSignals;
  rank: number;
  bodyChapters: number;
  onSelect: (id: string) => void;
}>) {
  const { t } = useTranslation('analysis');
  const advice = interpretationAdvice(signals);
  const style = typeStyle(signals.imageryType);

  const CTA_KEY = {
    recommended: 'symbol.overview.picks.ctaRecommended',
    available: 'symbol.overview.picks.ctaAvailable',
    discouraged: 'symbol.overview.picks.ctaDiscouraged',
  } as const;
  const cta = signals.reviewStatus
    ? t('symbol.overview.picks.ctaReviewed', {
        status: t(`symbol.review.${signals.reviewStatus}`),
      })
    : t(CTA_KEY[advice]);
  // Sparkles marks spending, and only spending. It is on the CTA that would start
  // a generation, and on nothing that merely reports one already exists.
  const costsTokens = !signals.reviewStatus && advice === 'recommended';

  return (
    <button
      type="button"
      className={'sym-pick' + (rank === 1 ? ' is-lead' : '')}
      onClick={() => onSelect(signals.id)}
    >
      <div className="sym-pick-head">
        <span className="sym-pick-rank">{t('symbol.overview.picks.rank', { rank })}</span>
        <span className="sym-pick-term">{signals.term}</span>
        <TypePill type={signals.imageryType} />
        <span className="sym-pick-spacer" />
        <span className="sym-pick-load">
          {t('symbol.overview.picks.load', { value: signals.load.toFixed(2) })}
        </span>
      </div>

      <p className="sym-pick-claim">{behaviourLine(t, signals)}</p>

      <div className="sym-pick-tags">
        <span className="sym-pick-tag">
          {t('symbol.overview.picks.tagSpan', {
            hit: signals.distribution.bodyChapters.length,
            total: bodyChapters,
          })}
        </span>
        <span className="sym-pick-tag">
          {t('symbol.overview.picks.tagEvents', { count: signals.eventCount })}
        </span>
        <span
          className="sym-pick-tag"
          style={
            signals.trust < TRUST_FLOOR
              ? { color: 'var(--status-partial-fg)', background: 'var(--status-partial-bg)' }
              : undefined
          }
        >
          {t('symbol.overview.picks.tagTrust', { value: Math.round(signals.trust * 100) })}
        </span>
      </div>

      <div
        className="sym-pick-cta"
        style={advice === 'discouraged' ? { color: 'var(--fg-muted)' } : undefined}
      >
        {costsTokens && <Sparkles size={12} aria-hidden="true" />}
        <span style={{ borderBottom: `1px solid ${style.dot}` }}>{cta}</span>
      </div>
    </button>
  );
}

/** Consecutive slots of the same segment, so the axis can be labelled in three parts. */
function axisRuns(axis: ChapterAxis) {
  const runs: Array<{ segment: ChapterSegment; slots: number[]; flex: number }> = [];
  for (const slot of axis.slots) {
    const last = runs.at(-1);
    const flex = slot.segment === 'body' ? 1 : OUTSIDE_CELL_FLEX;
    if (last?.segment === slot.segment) {
      last.slots.push(slot.chapter);
      last.flex += flex;
    } else {
      runs.push({ segment: slot.segment, slots: [slot.chapter], flex });
    }
  }
  return runs;
}

function axisRunLabel(
  t: TFunction<'analysis'>,
  run: { segment: ChapterSegment; slots: number[] },
): string {
  if (run.segment === 'body') {
    return t('symbol.overview.heat.axisBody', {
      first: run.slots[0],
      last: run.slots.at(-1),
    });
  }
  return run.segment === 'front'
    ? t('symbol.overview.heat.axisFront')
    : t('symbol.overview.heat.axisBack');
}

/**
 * Every ranked symbol against the same chapter axis.
 *
 * Only the ranked list appears. Adding the single-occurrence tail would be 18 rows
 * of one cell each — no shape to compare, and enough of them to bury the 11 rows
 * that have one.
 */
function DensityHeatmap({
  analysis,
  sortAxis,
}: Readonly<{ analysis: SymbolAnalysis | null; sortAxis: SortAxis }>) {
  const { t } = useTranslation('analysis');
  const rows = useMemo(
    () => (analysis ? rankSymbols(analysis.main, sortAxis) : []),
    [analysis, sortAxis],
  );
  if (!analysis || rows.length === 0) return null;

  const { axis } = analysis;
  const runs = axisRuns(axis);
  const bodyRun = runs.find((r) => r.segment === 'body');
  const renderedMax = rows.reduce(
    (max, s) => Math.max(max, ...Object.values(s.item.chapter_distribution ?? {}), 0),
    1,
  );

  return (
    <section className="sym-dash-card sym-dash-card-wide">
      <div className="sym-dash-card-head">
        <span className="sym-dash-card-title">{t('symbol.dashboard.heatTitle')}</span>
        <span className="sym-dash-card-meta">
          {t('symbol.overview.heat.meta', {
            rows: rows.length,
            slots: axis.slots.length,
            max: axis.globalBodyMax,
          })}
        </span>
      </div>
      {/* Stated on the card, because it is the whole reason the colours can be
          compared between rows rather than only within one. */}
      <p className="sym-heat-sub">{t('symbol.overview.heat.subtitle')}</p>

      <div className="sym-heat">
        <div className="sym-heat-axis">
          <span className="sym-heat-name" />
          {runs.map((run) => (
            <span
              key={run.segment + run.slots[0]}
              className={'sym-heat-axis-run' + (run.segment === 'body' ? ' is-body' : '')}
              style={{ flex: run.flex }}
            >
              {axisRunLabel(t, run)}
            </span>
          ))}
          <span className="sym-heat-metric" />
        </div>

        {rows.map((s) => {
          const distribution = s.item.chapter_distribution ?? {};
          return (
            <div key={s.id} className="sym-heat-row">
              <span className="sym-heat-name">
                <span
                  className="sym-heat-dot"
                  style={{ background: typeStyle(s.imageryType).dot }}
                />
                {s.term}
              </span>
              {axis.slots.map((slot) => {
                const count = distribution[String(slot.chapter)] ?? 0;
                const isBody = slot.segment === 'body';
                return (
                  <span
                    key={slot.chapter}
                    className="sym-heat-cell"
                    style={{
                      flex: isBody ? 1 : OUTSIDE_CELL_FLEX,
                      background: count > 0 ? densityStep(count) : undefined,
                      // A dashed edge marks evidence that sits outside the story:
                      // kept visible, but excluded from shape and first appearance.
                      border:
                        count > 0 && !isBody
                          ? '1px dashed var(--fg-muted)'
                          : `var(--line-weight) var(--border-style) var(--bg-tertiary)`,
                    }}
                    title={`${t('symbol.chapterN', { n: slot.chapter })}: ${count}`}
                  />
                );
              })}
              <span className="sym-heat-metric">{s.load.toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      <div className="sym-heat-legend">
        {densityLegendSteps(renderedMax).map((step) => (
          <span key={step} className="sym-heat-legend-item">
            <span className="sym-heat-legend-swatch" style={{ background: densityStep(step) }} />
            {step === 3
              ? t('symbol.overview.heat.legendMore', { count: step })
              : t('symbol.overview.heat.legendStep', { count: step })}
          </span>
        ))}
        <span className="sym-heat-legend-item">
          <span className="sym-heat-legend-swatch is-outside" />
          {t('symbol.overview.heat.legendOutside')}
        </span>
      </div>
      {bodyRun && <p className="sym-heat-note">{t('symbol.overview.heat.note')}</p>}
    </section>
  );
}

/**
 * The book's symbols grouped by the shape they trace through it.
 *
 * A shape is the one thing about a symbol that a reader can hold in mind while
 * comparing it to another, so it doubles as the coarse filter for the list: seeing
 * that four symbols all leave by chapter 3 is a question, and clicking the group
 * is how it gets asked.
 */
function ShapeGroups({
  analysis,
  shapeFilter,
  setShapeFilter,
}: Readonly<{
  analysis: SymbolAnalysis | null;
  shapeFilter: DistributionShape | null;
  setShapeFilter: (v: DistributionShape | null) => void;
}>) {
  const { t } = useTranslation('analysis');
  const groups = useMemo(() => {
    const main = analysis?.main ?? [];
    return SHAPE_ORDER.map((shape) => ({
      shape,
      members: main.filter((s) => s.shape === shape),
    })).filter((g) => g.members.length > 0);
  }, [analysis]);

  if (groups.length === 0) return null;

  return (
    <section className="sym-dash-card">
      <div className="sym-dash-card-head">
        <span className="sym-dash-card-title">{t('symbol.overview.shapes.title')}</span>
        <span className="sym-dash-card-meta">{t('symbol.overview.shapes.subtitle')}</span>
      </div>
      <div className="sym-shape-list">
        {groups.map(({ shape, members }) => {
          const active = shapeFilter === shape;
          return (
            <button
              key={shape}
              type="button"
              className={'sym-shape-row' + (active ? ' is-active' : '')}
              aria-pressed={active}
              onClick={() => setShapeFilter(active ? null : shape)}
            >
              <span className="sym-shape-n">{members.length}</span>
              <span className="sym-shape-label">{t(`symbol.overview.shapes.${shape}`)}</span>
              <span className="sym-shape-members">{members.map((s) => s.term).join('、')}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Where a tail word sits when it never reaches the body.
 *
 * A missing first body chapter means front matter *or* back matter, and calling
 * both 「前」 rebuilds exactly the conflation the three-way axis exists to undo —
 * 「戒指」 appears once, in the afterword, and labelling it front matter says the
 * opposite of what it does.
 */
function tailChapterLabel(t: TFunction<'analysis'>, s: SymbolSignals): string {
  const first = s.distribution.firstBodyChapter;
  if (first !== null) return t('symbol.overview.tail.chapter', { chapter: first });
  return s.distribution.back > 0
    ? t('symbol.overview.tail.chapterBack')
    : t('symbol.overview.tail.chapterFront');
}

/**
 * The words that occur exactly once.
 *
 * They are the majority of what symbol discovery returns, and they have nothing
 * to rank: no distribution, no allies, no attachment. Shown as a cloud rather
 * than a list of identical one-count bars — the old chart drew 18 rows of the
 * same length — and sized by where they first appear, so the shape of the cloud
 * says something the bars did not.
 */
function TailCloud({
  analysis,
  onSelect,
}: Readonly<{ analysis: SymbolAnalysis | null; onSelect: (id: string) => void }>) {
  const { t } = useTranslation('analysis');
  const tail = analysis?.tail ?? [];
  const total = analysis?.all.length ?? 0;
  if (tail.length === 0) return null;

  const bodyChapters = analysis?.axis.bodyChapterCount ?? 0;

  return (
    <section className="sym-dash-card sym-dash-card-wide">
      <div className="sym-dash-card-head">
        <span className="sym-dash-card-title">
          {t('symbol.overview.tail.title', { count: tail.length })}
        </span>
        <span className="sym-dash-card-meta">
          {t('symbol.overview.tail.meta', {
            pct: total > 0 ? Math.round((tail.length / total) * 100) : 0,
          })}
        </span>
      </div>
      <p className="sym-tail-desc">{t('symbol.overview.tail.description')}</p>
      <div className="sym-tail-cloud">
        {tail.map((s) => {
          const first = s.distribution.firstBodyChapter;
          const ratio = first !== null && bodyChapters > 1 ? (first - 1) / (bodyChapters - 1) : 0;
          return (
            <button
              key={s.id}
              type="button"
              className="sym-tail-word"
              onClick={() => onSelect(s.id)}
              style={{
                fontSize: `${(TAIL_MIN_REM + ratio * (TAIL_MAX_REM - TAIL_MIN_REM)).toFixed(3)}rem`,
                // A word that only ever appears in front matter is greyed: it is
                // in the book without being in the story.
                color: first === null ? 'var(--fg-muted)' : 'var(--fg-secondary)',
                borderBottomColor: typeStyle(s.imageryType).dot,
              }}
            >
              {s.term}
              <span className="sym-tail-ch">{tailChapterLabel(t, s)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function SymbolsDashboard({
  analysis,
  sortAxis,
  shapeFilter,
  setShapeFilter,
  onSelect,
}: Readonly<Props>) {
  const totalOccurrences = useMemo(
    () => (analysis?.all ?? []).reduce((sum, s) => sum + s.frequency, 0),
    [analysis],
  );

  return (
    <div className="sym-dash">
      <OverviewHeader analysis={analysis} totalOccurrences={totalOccurrences} />
      <StartHere analysis={analysis} onSelect={onSelect} />

      <div className="sym-dash-grid">
        <DensityHeatmap analysis={analysis} sortAxis={sortAxis} />
        <ShapeGroups
          analysis={analysis}
          shapeFilter={shapeFilter}
          setShapeFilter={setShapeFilter}
        />
        <TailCloud analysis={analysis} onSelect={onSelect} />
      </div>
    </div>
  );
}
