import { useTranslation } from 'react-i18next';
import { ArrowLeft, Network } from 'lucide-react';

import { AxisHeader, ChapterCells } from './ChapterGrid';
import { shapeLabel } from './symbolPhrases';
import { typeStyle } from './tokens';
import type { ChapterAxis } from './chapterAxis';
import { ALLY_MIN_COUNT, type SymbolCluster } from './symbolClusters';

interface Props {
  cluster: SymbolCluster;
  axis: ChapterAxis;
  onBack: () => void;
  onSelect: (id: string) => void;
}

/**
 * A cluster's members stacked on one chapter axis.
 *
 * The question this answers is what a group of symbols carries between them,
 * which no single symbol's own page can show: 海 running through the book and 沙
 * arriving only after chapter 5 is a fact about the pair, visible only when their
 * rows share an axis.
 *
 * It is deliberately not a small knowledge graph. Rows are symbols, columns are
 * chapters, colour is occurrence count — there are no edges here, and "who is
 * related to whom" remains the knowledge graph page's question.
 */
export function ClusterView({ cluster, axis, onBack, onSelect }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const { seed, members, hotChapters, hotCount } = cluster;

  return (
    <div className="sym-dash">
      <header className="sym-ov-head">
        <nav className="sym-crumbs">
          <button type="button" className="sym-crumb-back" onClick={onBack}>
            <ArrowLeft size={12} aria-hidden="true" />
            {t('symbol.detail.backToMap')}
          </button>
          <span className="sym-crumb-sep" aria-hidden="true">
            /
          </span>
          <span className="sym-crumb-here">{t('symbol.cluster.crumb')}</span>
        </nav>
        <h2 className="sym-ov-title">{t('symbol.cluster.title', { term: seed.term })}</h2>
        {/* States how the group was built, not what it means. What it means is the
            grid below, and a prose claim about it would be authored rather than
            computed. */}
        <p className="sym-ov-meta">
          {t('symbol.cluster.method', {
            term: seed.term,
            min: ALLY_MIN_COUNT,
            count: members.length,
          })}
        </p>
      </header>

      <section className="sym-dash-card sym-dash-card-wide">
        <div className="sym-dash-card-head">
          <Network size={13} style={{ color: 'var(--accent)' }} />
          <span className="sym-dash-card-title">{t('symbol.cluster.gridTitle')}</span>
          <span className="sym-dash-card-meta">
            {t('symbol.cluster.gridMeta', { count: members.length })}
          </span>
        </div>

        <div className="sym-heat">
          <div className="sym-heat-axis">
            <span className="sym-heat-name" />
            <AxisHeader axis={axis} />
            <span className="sym-cluster-shape" />
          </div>

          {members.map(({ signals, withSeed }) => (
            <button
              key={signals.id}
              type="button"
              className={'sym-heat-row sym-cluster-row' + (withSeed === null ? ' is-seed' : '')}
              onClick={() => onSelect(signals.id)}
            >
              <span className="sym-heat-name">
                <span
                  className="sym-heat-dot"
                  style={{ background: typeStyle(signals.imageryType).dot }}
                />
                {signals.term}
                <span className="sym-cluster-weight">
                  {withSeed === null
                    ? t('symbol.cluster.seed')
                    : t('symbol.cluster.withSeed', { count: withSeed })}
                </span>
              </span>
              <ChapterCells
                distribution={signals.item.chapter_distribution ?? {}}
                axis={axis}
              />
              <span className="sym-cluster-shape">{shapeLabel(t, signals)}</span>
            </button>
          ))}
        </div>

        <p className="sym-cluster-hot">
          {hotCount > 0
            ? t('symbol.cluster.hot', {
                chapters: hotChapters.join('、'),
                count: hotCount,
                total: members.length,
              })
            : t('symbol.cluster.hotNone')}
        </p>
      </section>

      <p className="sym-cluster-boundary">{t('symbol.cluster.boundary')}</p>
    </div>
  );
}
