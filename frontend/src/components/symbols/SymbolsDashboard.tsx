import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from 'lucide-react';

import { BatchFailureList } from '@/components/analysis/BatchFailureList';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import type { TFunction } from 'i18next';
import { AxisHeader, ChapterCells } from './ChapterGrid';
import { TypePill } from './Badges';
import { densityStep, typeStyle } from './tokens';
import { behaviourLine, distributionSummary } from './symbolPhrases';
import type { SymbolBatch } from './hooks/useSymbolBatch';
import type { SymbolCheck } from './hooks/useSymbolCheck';
import { ALLY_MIN_COUNT, findClusters } from './symbolClusters';
import {
  interpretationAdvice,
  rankSymbols,
  type DistributionShape,
  type SortAxis,
  type SymbolAnalysis,
  type SymbolSignals,
} from './symbolSignals';
import {
  computableSignals,
  densityLegend,
  isBelowTrustFloor,
  tailIsMuted,
  tailSize,
  trustPct,
} from './symbolViewModel';

type Props = {
  analysis: SymbolAnalysis | null;
  /** Rows the server sent, for the 「可算」 figure in the header. */
  serverRowCount: number;
  batch: SymbolBatch;
  check: SymbolCheck;
  /**
   * Why the batch buttons are held, or null. Set while a single interpretation
   * runs: a batch started then would reach that symbol before its result is
   * cached and pay for it a second time.
   */
  blockedReason: string | null;
  /** Heatmap rows follow the sidebar's axis, so the two never disagree on order. */
  sortAxis: SortAxis;
  shapeFilter: DistributionShape | null;
  setShapeFilter: (v: DistributionShape | null) => void;
  onSelect: (id: string) => void;
  /** Opens the cluster view for a seed symbol. */
  onOpenCluster: (seedId: string) => void;
};

/** Order groups by how much of a claim they make, not alphabetically. */
const SHAPE_ORDER: DistributionShape[] = [
  'through', 'backHalf', 'frontHalf', 'earlyExit', 'lateEntry', 'scatter', 'single', 'none',
];

/** How many symbols the "strongest few" batch covers. */
const BATCH_TOP_N = 5;

/** How many recommendations fit before the reader is choosing from a list again. */
const PICK_COUNT = 3;

/**
 * What the book contains, and what it costs to learn more.
 *
 * Replaces four stat tiles, two of which read 0 on any book nobody has spent
 * tokens on — which is every book at first. The counts that matter are here as a
 * sentence, including the one the tiles never showed: how many symbols have
 * evidence partly drawn from front matter.
 *
 * There is no legend explaining the LLM glyph here any more: it is on the buttons
 * that spend tokens and nowhere else, which is the explanation.
 */
function OverviewHeader({
  analysis,
  serverRowCount,
  totalOccurrences,
  batch,
  check,
  blockedReason,
}: Readonly<{
  analysis: SymbolAnalysis | null;
  serverRowCount: number;
  totalOccurrences: number;
  batch: SymbolBatch;
  check: SymbolCheck;
  blockedReason: string | null;
}>) {
  const { t } = useTranslation('analysis');
  const all = analysis?.all ?? [];
  const total = all.length;
  const interpreted = all.filter((s) => s.hasInterpretation).length;
  const noisy = (analysis?.main ?? []).filter(isBelowTrustFloor).length;
  const signals = computableSignals({ all }, serverRowCount);

  const meta = [
    t('symbol.overview.meta.symbols', { count: total }),
    t('symbol.overview.meta.occurrences', { count: totalOccurrences }),
    // Stated because it is the page's premise: ranking works before any token is
    // spent, so an empty interpretation count is not an empty page.
    t('symbol.overview.meta.signals', { count: signals.computable, total: signals.total }),
    t('symbol.overview.meta.interpreted', { count: interpreted, total }),
  ];
  if (noisy > 0) meta.push(t('symbol.overview.meta.noisy', { count: noisy }));

  return (
    <header className="sym-ov-head">
      <div className="sym-ov-head-main">
        <h1 className="sym-ov-title">{t('symbol.overview.title')}</h1>
        <p className="sym-ov-meta">{meta.join(t('symbol.overview.meta.separator'))}</p>
      </div>
      <BatchButtons
        analysis={analysis}
        batch={batch}
        check={check}
        blockedReason={blockedReason}
      />
    </header>
  );
}

interface PendingRun {
  message: string;
  ids: string[];
  /** Runs after the batch has actually started, e.g. leaving picking mode. */
  onStarted?: () => void;
}

/**
 * Three ways to spend tokens in bulk, all behind a confirmation.
 *
 * None of them runs on the single-occurrence tail. It is the majority of the
 * symbols and has nothing to interpret, so "everything" spending most of the
 * budget there is the one thing the word must not mean.
 */
function BatchButtons({
  analysis,
  batch,
  check,
  blockedReason,
}: Readonly<{
  analysis: SymbolAnalysis | null;
  batch: SymbolBatch;
  check: SymbolCheck;
  blockedReason: string | null;
}>) {
  const { t } = useTranslation('analysis');
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const main = analysis?.main ?? [];
  const pending = main.filter((s) => !s.hasInterpretation);
  if (batch.running || pending.length === 0) return null;

  const topN = pending.slice(0, BATCH_TOP_N);

  // While picking, the two fixed-scope buttons are withdrawn rather than left
  // beside the pick controls: both spend immediately, on a set the reader is in
  // the middle of not choosing, and 「全部 11 個」 sitting one target away from
  // 「生成已勾選」 turns a mis-click into a bill.
  let buttons;
  if (check.active) {
    buttons = (
      <>
        <Tooltip label={blockedReason ?? ''} disabled={!blockedReason}>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
            disabled={batch.pending || check.ids.length === 0 || !!blockedReason}
            onClick={() =>
              setPendingRun({
                message: t('symbol.overview.batch.confirmChecked', { count: check.ids.length }),
                ids: check.ids,
                onStarted: check.exit,
              })
            }
          >
            {t('symbol.overview.batch.checked', { count: check.ids.length })}
          </button>
        </Tooltip>
        {/* Switching mode costs nothing, so it carries no glyph. */}
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={check.toggleMode}>
          {t('symbol.overview.batch.checkOff')}
        </button>
      </>
    );
  } else {
    buttons = (
      <>
        {topN.length > 1 && (
          <Tooltip label={blockedReason ?? ''} disabled={!blockedReason}>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-primary ss-btn-llm"
              disabled={batch.pending || !!blockedReason}
              onClick={() =>
                setPendingRun({
                  message: t('symbol.overview.batch.confirmTopN', { count: topN.length }),
                  ids: topN.map((s) => s.id),
                })
              }
            >
              {t('symbol.overview.batch.topN', { count: topN.length })}
            </button>
          </Tooltip>
        )}
        <Tooltip label={blockedReason ?? ''} disabled={!blockedReason}>
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
            disabled={batch.pending || !!blockedReason}
            onClick={() =>
              setPendingRun({
                message: t('symbol.overview.batch.confirmAll', { count: main.length }),
                ids: main.map((s) => s.id),
              })
            }
          >
            {t('symbol.overview.batch.all', { count: main.length })}
          </button>
        </Tooltip>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={check.toggleMode}>
          {t('symbol.overview.batch.check')}
        </button>
      </>
    );
  }

  return (
    <div className="sym-ov-batch-btns">
      {buttons}
      <ConfirmDialog
        open={pendingRun !== null}
        title={t('symbol.overview.batch.confirmTitle')}
        message={pendingRun?.message ?? ''}
        spendsTokens
        onConfirm={() => {
          if (!pendingRun) return;
          batch.start(pendingRun.ids);
          pendingRun.onStarted?.();
          setPendingRun(null);
        }}
        onCancel={() => setPendingRun(null)}
      />
    </div>
  );
}

/** Progress while a run is going, and its tally once it is not. */
function BatchProgress({ batch }: Readonly<{ batch: SymbolBatch }>) {
  const { t } = useTranslation('analysis');
  if (!batch.running && batch.summary === null && batch.error === null) return null;

  if (batch.error !== null) {
    return (
      <div className="sym-ov-batch-panel is-error" role="alert">
        <span>{batch.error}</span>
        <button type="button" className="sym-ov-batch-dismiss" onClick={batch.dismiss}>
          {t('symbol.overview.batch.dismiss')}
        </button>
      </div>
    );
  }

  if (batch.running) {
    const pct = batch.total > 0 ? Math.round((batch.processed / batch.total) * 100) : 0;
    // No cancel here, on purpose: the design draws none, and a control the
    // batch endpoint cannot honour is a promise the page cannot keep.
    return (
      // role="status": the run starts and moves on off-screen from wherever the
      // reader's focus is; a polite region says so without stealing focus.
      <div className="sym-ov-batch-panel" role="status">
        <Loader size={14} className="sym-ov-batch-spinner" aria-hidden="true" />
        <span className="sym-ov-batch-stage">{t('symbol.overview.batch.running')}</span>
        {batch.stage && <span className="sym-ov-batch-substage">{batch.stage}</span>}
        <progress
          className="sym-ov-batch-track"
          value={pct}
          max={100}
          aria-label={t('symbol.overview.batch.running')}
        />
        <span className="sym-ov-batch-hint">{t('symbol.overview.batch.hint')}</span>
      </div>
    );
  }

  const s = batch.summary!;
  return (
    <div className="sym-ov-batch-panel is-done" role="status">
      <div className="sym-ov-batch-line">
        <span className="sym-ov-batch-stage">{t('symbol.overview.batch.done')}</span>
        <button type="button" className="sym-ov-batch-dismiss" onClick={batch.dismiss}>
          {t('symbol.overview.batch.dismiss')}
        </button>
      </div>
      <div className="sym-ov-batch-stats">
        <div className="sym-ov-batch-stat">
          <span className="sym-ov-batch-stat-n">{s.progress - s.skipped - s.failed}</span>
          <span className="sym-ov-batch-stat-l">{t('symbol.overview.batch.statGenerated')}</span>
        </div>
        <div className="sym-ov-batch-stat">
          <span className="sym-ov-batch-stat-n">{s.skipped}</span>
          <span className="sym-ov-batch-stat-l">{t('symbol.overview.batch.statSkipped')}</span>
        </div>
        <div className={'sym-ov-batch-stat' + (s.failed > 0 ? ' is-failed' : '')}>
          <span className="sym-ov-batch-stat-n">{s.failed}</span>
          <span className="sym-ov-batch-stat-l">{t('symbol.overview.batch.statFailed')}</span>
        </div>
      </div>
      {/* This sweep is the one with only ids to report — see BatchFailureList. */}
      <BatchFailureList failures={s.failures ?? []} />
    </div>
  );
}

/**
 * The three symbols worth opening first.
 *
 * A ranked list still asks the reader to choose. These name the choice and say
 * why, so the page has an answer to "which one?" before anything is clicked.
 * The first pick is drawn larger than the other two (B2): it is the page's actual
 * recommendation, and three equal cards said nothing about which of them was.
 */
function StartHere({
  analysis,
  onSelect,
}: Readonly<{ analysis: SymbolAnalysis | null; onSelect: (id: string) => void }>) {
  const { t } = useTranslation('analysis');
  const picks = (analysis?.main ?? []).slice(0, PICK_COUNT);
  const bodyChapters = analysis?.axis.bodyChapterCount ?? 0;
  const [lead, ...rest] = picks;

  return (
    <section className="sym-dash-card is-triage">
      <div className="sym-dash-card-head">
        <h2 className="sym-dash-card-title">{t('symbol.overview.picks.title')}</h2>
        <span className="sym-dash-card-meta">
          {t('symbol.overview.picks.subtitle', { count: picks.length })}
        </span>
      </div>
      {picks.length === 0 ? (
        <p className="sym-list-empty">{t('symbol.overview.picks.empty')}</p>
      ) : (
        <div className="sym-pick-grid">
          <PickCard signals={lead} rank={1} bodyChapters={bodyChapters} onSelect={onSelect} />
          {rest.length > 0 && (
            <div className="sym-pick-rest">
              {rest.map((s, i) => (
                <PickCard
                  key={s.id}
                  signals={s}
                  rank={i + 2}
                  bodyChapters={bodyChapters}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
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
  const lead = rank === 1;

  const CTA_KEY = {
    blocked: 'symbol.overview.picks.ctaBlocked',
    recommended: 'symbol.overview.picks.ctaRecommended',
    available: 'symbol.overview.picks.ctaAvailable',
    discouraged: 'symbol.overview.picks.ctaDiscouraged',
  } as const;
  /*
   * A refusal outranks the review line. A symbol interpreted earlier and refused
   * on regeneration would otherwise show only 「已核可」, which reads as though
   * the card is current when the reader's last action failed.
   */
  let cta: string;
  if (advice === 'blocked') cta = t(CTA_KEY.blocked);
  else if (signals.reviewStatus) {
    cta = t('symbol.overview.picks.ctaReviewed', {
      status: t(`symbol.review.${signals.reviewStatus}`),
    });
  } else cta = t(CTA_KEY[advice]);

  const noisy = isBelowTrustFloor(signals);
  const trustChip = (
    <span className={'sym-pick-tag' + (noisy ? ' is-noisy' : '')}>
      {t('symbol.overview.picks.tagTrust', { value: trustPct(signals) })}
    </span>
  );

  return (
    <button
      type="button"
      className={'sym-pick' + (lead ? ' is-lead' : '')}
      onClick={() => onSelect(signals.id)}
    >
      <div className="sym-pick-head">
        <span className="sym-pick-rank">{t('symbol.overview.picks.rank', { rank })}</span>
        <span className="sym-pick-term">{signals.term}</span>
        <TypePill type={signals.imageryType} />
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
        {noisy ? (
          <Tooltip label={t('symbol.list.trustBelowFloor', { pct: trustPct(signals) })}>
            {trustChip}
          </Tooltip>
        ) : (
          trustChip
        )}
      </div>

      {/* Navigation to the detail view, not a spend: no LLM glyph here. */}
      <div
        className={'sym-pick-cta' + (advice === 'discouraged' ? ' is-muted' : '')}
      >
        <span style={{ borderBottom: `var(--line-weight) solid ${style.dot}` }}>{cta}</span>
      </div>
    </button>
  );
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
  const renderedMax = rows.reduce(
    (max, s) => Math.max(max, ...Object.values(s.item.chapter_distribution ?? {}), 0),
    1,
  );

  return (
    <section className="sym-dash-card">
      <div className="sym-dash-card-head">
        <h2 className="sym-dash-card-title">{t('symbol.dashboard.heatTitle')}</h2>
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
          <AxisHeader axis={axis} />
          <span className="sym-heat-metric">{t('symbol.overview.heat.loadHead')}</span>
        </div>

        {rows.map((s) => {
          const distribution = s.item.chapter_distribution ?? {};
          return (
            // One image per row: its cells say nothing without a pointer, so the
            // row's name carries the term, the counts and the load in words.
            <div
              key={s.id}
              className="sym-heat-row"
              role="img"
              aria-label={[
                t('symbol.chartLabel', {
                  term: s.term,
                  counts: distributionSummary(t, distribution, axis),
                }),
                `${t('symbol.overview.heat.loadHead')} ${s.load.toFixed(2)}`,
              ].join(t('symbol.overview.meta.separator'))}
            >
              <span className="sym-heat-name">
                <span
                  className="sym-heat-dot"
                  style={{ background: typeStyle(s.imageryType).dot }}
                />
                {s.term}
              </span>
              <ChapterCells distribution={distribution} axis={axis} />
              <span className="sym-heat-metric">{s.load.toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      {/* Two steps because the cells have two: every count of two or more takes the
          same shade, so a third swatch would promise a distinction not drawn. */}
      <div className="sym-heat-legend">
        {densityLegend(renderedMax).map((step) => (
          <span key={step} className="sym-heat-legend-item">
            <span className="sym-heat-legend-swatch" style={{ background: densityStep(step) }} />
            {step === 2
              ? t('symbol.overview.heat.legendMore', { count: step })
              : t('symbol.overview.heat.legendStep', { count: step })}
          </span>
        ))}
        <span className="sym-heat-legend-item">
          <span className="sym-heat-legend-swatch is-outside" />
          {t('symbol.overview.heat.legendOutside')}
        </span>
      </div>
      {axis.bodyChapterCount > 0 && (
        <p className="sym-heat-note">{t('symbol.overview.heat.note')}</p>
      )}
    </section>
  );
}

/**
 * The book's symbols grouped by the shape they trace through it.
 *
 * A shape is the one thing about a symbol that a reader can hold in mind while
 * comparing it to another, so it doubles as the coarse filter for the list: seeing
 * that four symbols all leave by chapter 3 is a question, and clicking the group
 * is how it gets asked. A shape nobody has is not listed — an empty row is a
 * claim that the group exists.
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
        <h2 className="sym-dash-card-title">{t('symbol.overview.shapes.title')}</h2>
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
              {/* Never cut to 「等 n 個」: a name list that hides names cannot be
                  checked against the filter it triggers. It wraps instead. */}
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
 * Groups of symbols that carry something together.
 *
 * A book with no cluster is the common case, not an error: an alliance needs two
 * shared paragraphs and a seed needs two such allies, so a book whose symbols
 * merely brush past each other has none. The card stays and says so in one line —
 * dropping it would leave the reader wondering whether the analysis ran — and the
 * boundary declaration stays with it, because it is about what this card is not.
 */
function ClusterCard({
  analysis,
  onOpenCluster,
}: Readonly<{ analysis: SymbolAnalysis | null; onOpenCluster: (seedId: string) => void }>) {
  const { t } = useTranslation('analysis');
  const clusters = useMemo(() => (analysis ? findClusters(analysis) : []), [analysis]);

  return (
    <section className="sym-dash-card">
      <div className="sym-dash-card-head">
        <h2 className="sym-dash-card-title">{t('symbol.cluster.cardTitle')}</h2>
        <span className="sym-dash-card-meta">
          {t('symbol.cluster.cardMeta', { min: ALLY_MIN_COUNT })}
        </span>
      </div>
      {clusters.length === 0 ? (
        <p className="sym-cluster-empty">{t('symbol.cluster.empty')}</p>
      ) : (
        <div className="sym-cluster-list">
          {clusters.map((cluster) => (
            <button
              key={cluster.seed.id}
              type="button"
              className="sym-cluster-entry"
              onClick={() => onOpenCluster(cluster.seed.id)}
            >
              <span className="sym-cluster-entry-head">
                <span className="sym-cluster-entry-name">
                  {t('symbol.cluster.title', { term: cluster.seed.term })}
                </span>
                <span className="sym-cluster-entry-n">
                  {t('symbol.cluster.gridMeta', { count: cluster.members.length })}
                </span>
              </span>
              <span className="sym-cluster-pills">
                {cluster.members.slice(1).map(({ signals, withSeed }) => {
                  const style = typeStyle(signals.imageryType);
                  return (
                    <span
                      key={signals.id}
                      className="sym-cluster-pill"
                      style={{ background: style.bg, color: style.fg, borderColor: style.dot }}
                    >
                      {signals.term}
                      <span className="sym-cluster-pill-n">{withSeed}</span>
                    </span>
                  );
                })}
              </span>
              {/* The finding, not the membership: a shared landing point is the
                  reason to open the group at all. */}
              {cluster.hotCount > 0 && (
                <span className="sym-cluster-entry-hot">
                  {t('symbol.cluster.hot', {
                    chapters: cluster.hotChapters.join('、'),
                    count: cluster.hotCount,
                    total: cluster.members.length,
                  })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <p className="sym-cluster-boundary">{t('symbol.cluster.boundary')}</p>
    </section>
  );
}

/**
 * The words that occur exactly once.
 *
 * They are the majority of what symbol discovery returns, and they have nothing
 * to rank: no distribution, no allies, no attachment. Shown as a cloud rather
 * than a list of identical one-count bars — the old chart drew 18 rows of the
 * same length — and sized by where they first appear, in five type steps, so the
 * shape of the cloud says something the bars did not.
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
    <section className="sym-dash-card">
      <div className="sym-dash-card-head">
        <h2 className="sym-dash-card-title">
          {t('symbol.overview.tail.title', { count: tail.length })}
        </h2>
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
          return (
            <button
              key={s.id}
              type="button"
              className={'sym-tail-word' + (tailIsMuted(first) ? ' is-muted' : '')}
              onClick={() => onSelect(s.id)}
              style={{
                fontSize: `var(--font-size-${tailSize(first, bodyChapters)})`,
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
  serverRowCount,
  batch,
  check,
  sortAxis,
  shapeFilter,
  setShapeFilter,
  onSelect,
  onOpenCluster,
  blockedReason,
}: Readonly<Props>) {
  const totalOccurrences = useMemo(
    () => (analysis?.all ?? []).reduce((sum, s) => sum + s.frequency, 0),
    [analysis],
  );

  return (
    <div className="sym-dash">
      <OverviewHeader
        analysis={analysis}
        serverRowCount={serverRowCount}
        totalOccurrences={totalOccurrences}
        batch={batch}
        check={check}
        blockedReason={blockedReason}
      />
      <BatchProgress batch={batch} />
      <StartHere analysis={analysis} onSelect={onSelect} />
      <DensityHeatmap analysis={analysis} sortAxis={sortAxis} />

      {/* Two equal columns stretched to equal height; below 720px of main column
          they stack. 352 × 2 + the 16px gap is 720. */}
      <div className="sym-dash-split">
        <ShapeGroups
          analysis={analysis}
          shapeFilter={shapeFilter}
          setShapeFilter={setShapeFilter}
        />
        <ClusterCard analysis={analysis} onOpenCluster={onOpenCluster} />
      </div>

      <TailCloud analysis={analysis} onSelect={onSelect} />
    </div>
  );
}
