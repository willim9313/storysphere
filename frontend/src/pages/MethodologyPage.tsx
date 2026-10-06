import { useState, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, ChevronRight, Search } from 'lucide-react';
import {
  getFrameworks,
  getFrameworkCategories,
  type Framework,
  type FrameworkItem,
} from '@/data/frameworksData';
import { ConceptDiagram } from '@/components/methodology/ConceptDiagram';
import {
  buildRailGroups,
  firstOfCategory,
  groupItemsByBadge,
  normalizeQuery,
  scaleLabel,
} from '@/components/methodology/methodologyModel';
import { Tooltip } from '@/components/ui/Tooltip';
import '@/styles/methodology.css';

type Mode = 'about' | 'cross';
type Tier = 'established' | 'presumed' | 'tentative';

/** 兩種告誡框（HonestCallout／NoConfidenceNote）共用同一外框＋alert-triangle。 */
function Callout({ title, body }: { title: string; body: string }) {
  return (
    <div className="md-callout" role="note">
      <span className="md-callout-icon">
        <AlertTriangle size={16} color="var(--color-warning)" aria-hidden="true" />
      </span>
      <div className="md-callout-text">
        <div className="md-callout-title">{title}</div>
        <p className="md-callout-body">{body}</p>
      </div>
    </div>
  );
}

// 三層級：圓點數是非色相編碼（●●● / ●●○ / ●○○）；不畫成連續漸層條。
const TIERS: { tier: Tier; dots: number }[] = [
  { tier: 'established', dots: 3 },
  { tier: 'presumed', dots: 2 },
  { tier: 'tentative', dots: 1 },
];

function TierLegend() {
  const { t } = useTranslation('frameworks');
  return (
    <div className="md-tierlegend">
      {TIERS.map(({ tier, dots }) => (
        <div className="md-tier" key={tier}>
          <span className="md-tier-dots" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`md-tier-dot ${i < dots ? 'on' : ''}`} />
            ))}
          </span>
          <span className="md-tier-name">{t(`tier.${tier}`)}</span>
          <code className="md-tier-range">{t(`tier.${tier}Range`)}</code>
          <span className="md-tier-desc">{t(`tier.${tier}Desc`)}</span>
        </div>
      ))}
    </div>
  );
}

interface RailProps {
  frameworks: Framework[];
  selectedKey: string;
  onSelect: (key: string) => void;
  query: string;
  setQuery: (q: string) => void;
}

function MethodologyRail({ frameworks, selectedKey, onSelect, query, setQuery }: RailProps) {
  const { t, i18n } = useTranslation('frameworks');
  const categories = getFrameworkCategories(i18n.language);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const searching = normalizeQuery(query) !== '';
  const groups = useMemo(
    () => buildRailGroups(frameworks, categories, query),
    [frameworks, categories, query],
  );

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  return (
    <nav className="md-rail" aria-label={t('brand')}>
      <div className="md-rail-head">
        <div className="md-rail-brand">
          {t('brand')}
          <span className="tag">{t('placeholder')}</span>
        </div>
        <div className="md-rail-sub">{t('brandSub')}</div>
      </div>
      <label className="md-search">
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPh')}
          aria-label={t('searchPh')}
        />
      </label>
      <div className="md-rail-scroll">
        <button
          type="button"
          className={`md-railitem ${selectedKey === 'overview' ? 'active' : ''}`}
          onClick={() => onSelect('overview')}
        >
          <span className="md-railitem-name">{t('overview')}</span>
        </button>
        {groups.map(({ category, frameworks: list }) => {
          // 搜尋期間所有分組強制展開
          const isOpen = searching || !collapsed[category.id];
          return (
            <div className="md-railgroup" key={category.id}>
              <button
                type="button"
                className="md-railgroup-label"
                aria-expanded={isOpen}
                onClick={() => toggle(category.id)}
                disabled={searching}
              >
                {!searching && (
                  <ChevronRight size={12} className={`md-railgroup-chev ${isOpen ? 'open' : ''}`} aria-hidden="true" />
                )}
                <span className="md-railgroup-name">{category.name}</span>
                <span className="md-railgroup-count">{list.length}</span>
              </button>
              {isOpen &&
                list.map((fw) => (
                  <button
                    type="button"
                    key={fw.key}
                    className={`md-railitem ${selectedKey === fw.key ? 'active' : ''}`}
                    onClick={() => onSelect(fw.key)}
                  >
                    <span className="md-railitem-name">{fw.name}</span>
                    <span className="md-railitem-meta">{scaleLabel(fw)}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

interface SectionHeadProps {
  no?: string;
  title: string;
  sub?: string;
}

function SectionHead({ no, title, sub }: SectionHeadProps) {
  return (
    <div className="md-sechead">
      {no && <span className="md-sechead-no">{no}</span>}
      <h2 className="md-sechead-title">{title}</h2>
      {sub && <span className="md-sechead-sub">{sub}</span>}
      <span className="md-sechead-rule" />
    </div>
  );
}

interface AboutTOCProps {
  sections: { id: string; label: string }[];
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}

function AboutTOC({ sections, scrollerRef }: AboutTOCProps) {
  const { t } = useTranslation('frameworks');
  // `key` on the component is set by the parent on framework change, so this
  // component remounts and the initial section is correct.
  const [active, setActive] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: '0px 0px -62% 0px', threshold: 0 },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections, scrollerRef]);

  const go = (id: string) => {
    const root = scrollerRef.current;
    const el = document.getElementById(id);
    if (!root || !el) return;
    const offset = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 24;
    root.scrollTo({ top: offset, behavior: 'smooth' });
  };

  return (
    <aside className="md-toc">
      <div className="md-toc-label">{t('onThisPage')}</div>
      <nav>
        {sections.map((s, i) => (
          <button
            type="button"
            key={s.id}
            className={`md-toc-item ${active === s.id ? 'active' : ''}`}
            onClick={() => go(s.id)}
          >
            <span className="md-toc-n">{String(i + 1).padStart(2, '0')}</span>
            <span className="md-toc-t">{s.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function ItemCard({ item, n, plain = false }: { item: FrameworkItem; n: number; plain?: boolean }) {
  return (
    <div className={plain ? 'md-itemcard md-itemcard-plain' : 'md-itemcard'}>
      <div className="md-itemcard-top">
        <span className="md-itemcard-num">{n}</span>
        <div className="md-itemcard-id">
          <span className="md-itemcard-name">{item.name}</span>
          {item.subtitle && <span className="md-itemcard-sub">{item.subtitle}</span>}
        </div>
        {item.badge && <span className="md-itemcard-badge">{item.badge}</span>}
      </div>
      {item.details.slice(0, 2).map((d) => (
        <span className="md-itemcard-detail" key={d.label}>
          <b>{d.label}</b> {d.value}
        </span>
      ))}
    </div>
  );
}

/** 類型一覽。Schmidt 45 張依 badge 首詞分組、組標頭 sticky；不分頁、不縮列表。 */
function ItemsGrid({ fw }: { fw: Framework }) {
  if (fw.key !== 'schmidt') {
    return (
      <div className="md-items">
        {fw.items.map((it, i) => (
          <ItemCard key={it.id} item={it} n={i + 1} plain />
        ))}
      </div>
    );
  }
  return (
    <div className="md-wall">
      {groupItemsByBadge(fw.items).map((g) => (
        <section key={g.label} className="md-wall-group">
          <div className="md-wall-head">
            <span>{g.label}</span>
            <span className="md-wall-count">{g.entries.length}</span>
          </div>
          <div className="md-items">
            {g.entries.map(({ item, n }) => (
              <ItemCard key={item.id} item={item} n={n} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface AboutModeProps {
  fw: Framework;
  sections: { id: string; label: string }[];
}

function AboutMode({ fw, sections }: AboutModeProps) {
  const { t } = useTranslation('frameworks');
  const pipeMeta = [t('input'), t('process'), t('output')];
  const conceptSub = t(`conceptSub.${fw.key}`, { defaultValue: '' });
  const no = (i: number) => String(i + 1).padStart(2, '0');

  return (
    <article className="md-article">
      <section id={sections[0].id} className="md-section">
        <SectionHead no={no(0)} title={t('secIntro')} />
        <p className="md-lead">{fw.description}</p>
        <div className="md-metarow">
          <div className="md-meta">
            <span className="md-meta-val">{fw.items.length}</span>
            <span className="md-meta-label">{fw.itemLabel}</span>
          </div>
          <div className="md-meta">
            <span className="md-meta-val">{fw.references.length}</span>
            <span className="md-meta-label">{t('sourceCount')}</span>
          </div>
        </div>
      </section>

      <section id={sections[1].id} className="md-section">
        <SectionHead no={no(1)} title={t('secConcept')} sub={conceptSub || undefined} />
        <ConceptDiagram fw={fw} />
      </section>

      <section id={sections[2].id} className="md-section">
        <SectionHead no={no(2)} title={t('secItems')} sub={scaleLabel(fw)} />
        <ItemsGrid fw={fw} />
      </section>

      <section id={sections[3].id} className="md-section">
        <SectionHead no={no(3)} title={t('secPipeline')} sub={t('pipelineSub')} />
        <div className="md-pipe">
          {fw.pipeline.map((s, i) => (
            <div className="md-pipe-slot" key={s.key}>
              <div className="md-pipe-step">
                <span className="md-pipe-kicker">{pipeMeta[i]}</span>
                <span className="md-pipe-title">{i + 1}</span>
                <span className="md-pipe-desc">{s.what}</span>
              </div>
              {i < fw.pipeline.length - 1 && (
                <span className="md-pipe-arrow" aria-hidden="true">
                  <ArrowRight size={16} />
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="md-subhead">{t('secOutput')}</div>
        <div className="md-schema">
          {fw.output.map((o) => (
            <div className="md-schema-row" key={o.field}>
              <code className="md-schema-field">{o.field}</code>
              <code className="md-schema-type">{o.type}</code>
              <span className="md-schema-note">{o.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section id={sections[4].id} className="md-section">
        <SectionHead no={no(4)} title={t('secConfidence')} />
        {fw.hasConfidence ? (
          <>
            <p className="md-conf-intro">{t('confIntro')}</p>
            <Callout title={t('honestTitle')} body={t('honestBody')} />
            <TierLegend />
          </>
        ) : (
          // 不產生信心值：只放 NoConfidenceNote，三層級圖例完全不顯示（不灰掉、不寫「不適用」、不折疊）
          <Callout title={t('noConfidenceTitle')} body={t('noConfidenceBody')} />
        )}
      </section>

      <section id={sections[5].id} className="md-section">
        <SectionHead no={no(5)} title={t('secTheory')} />
        <div className="md-refs">
          {fw.references.map((r, i) => (
            <div className="md-ref" key={`${r.author}-${r.year}-${r.title}`}>
              <span className="md-ref-marker">[{i + 1}]</span>
              <span className="md-ref-body">
                {r.author} ({r.year}). <em>{r.title}</em>. {r.publisher}.
                {r.note && <span className="md-ref-note"> — {r.note}</span>}
              </span>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function OverviewPage({ frameworks, onGoto }: { frameworks: Framework[]; onGoto: (key: string) => void }) {
  const { t, i18n } = useTranslation('frameworks');
  const categories = getFrameworkCategories(i18n.language);

  const onCardKey = (e: KeyboardEvent, key?: string) => {
    if (e.target !== e.currentTarget) return;
    if (key && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onGoto(key);
    }
  };

  return (
    <div className="md-overview">
      <div className="md-ov-hero">
        <div className="md-titlerow">
          <h1 className="md-title">{t('brand')}</h1>
          <span className="md-tag">{t('placeholder')}</span>
          <span className="md-notice">{t('globalNotice')}</span>
        </div>
        <p className="md-ov-lead">{t('ovLead')}</p>
      </div>
      <hr className="md-rule" />
      <SectionHead title={t('secConcept')} />
      <div className="md-ov-cats">
        {categories.map((cat) => {
          const list = frameworks.filter((f) => f.categoryId === cat.id);
          if (!list.length) return null;
          const first = firstOfCategory(frameworks, cat.id);
          return (
            <div
              key={cat.id}
              className="md-ov-catcard"
              onClick={() => first && onGoto(first.key)}
              onKeyDown={(e) => onCardKey(e, first?.key)}
              role="button"
              tabIndex={0}
            >
              <span className="md-ov-catname">{cat.name}</span>
              <div className="md-ov-catmethods">
                {list.map((fw) => (
                  <button
                    type="button"
                    key={fw.key}
                    className="md-ov-catmethod"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGoto(fw.key);
                    }}
                  >
                    <span className="nm">{fw.name}</span>
                    <span className="cnt">{scaleLabel(fw)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CrossBookComingSoon({ crossBook }: { crossBook: boolean }) {
  const { t } = useTranslation('frameworks');
  // 兩種佔位不合併：「即將推出」（時間問題）與「此方法不適用」（性質問題）。
  if (!crossBook) {
    return (
      <div className="md-cross">
        <p className="md-cross-body">{t('noCross')}</p>
      </div>
    );
  }
  return (
    <div className="md-cross">
      <span className="md-cross-soon">{t('crossSoonTitle')}</span>
      <p className="md-cross-body">{t('crossSoonBody')}</p>
    </div>
  );
}

export default function MethodologyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation('frameworks');
  const frameworks = getFrameworks(i18n.language);

  // Selected framework key is derived from the URL ?framework= param so that
  // navigation from other pages (e.g. CharacterAnalysisPage deep-link) syncs
  // automatically without a setState-in-effect dance.
  const paramKey = searchParams.get('framework');
  const selectedKey =
    paramKey && frameworks.some((f) => f.key === paramKey) ? paramKey : 'overview';

  const [mode, setMode] = useState<Mode>('about');
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const fw = selectedKey === 'overview' ? null : frameworks.find((f) => f.key === selectedKey) ?? null;

  const sections = useMemo(() => {
    if (!fw) return [];
    return [
      { id: 'sec-intro', label: t('secIntro') },
      { id: 'sec-concept', label: t('secConcept') },
      { id: 'sec-items', label: t('secItems') },
      { id: 'sec-impl', label: t('secPipeline') },
      { id: 'sec-conf', label: t('secConfidence') },
      { id: 'sec-refs', label: t('secTheory') },
    ];
  }, [fw, t]);

  const goto = (key: string) => {
    setMode('about');
    contentRef.current?.scrollTo({ top: 0 });
    const next = new URLSearchParams(searchParams);
    if (key === 'overview') {
      next.delete('framework');
    } else {
      next.set('framework', key);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="md-app">
      <MethodologyRail
        frameworks={frameworks}
        selectedKey={selectedKey}
        onSelect={goto}
        query={query}
        setQuery={setQuery}
      />

      <div className="md-main">
        <div className="md-content" ref={contentRef}>
          <div className="md-page">
            {!fw && <OverviewPage frameworks={frameworks} onGoto={goto} />}
            {fw && (
              <>
                <header className="md-head">
                  <div className="md-titlerow">
                    <h1 className="md-title">{fw.name}</h1>
                    <span className="md-cat-chip">{fw.category}</span>
                    <span className="md-notice">{t('globalNotice')}</span>
                  </div>
                  <div className="md-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'about'}
                      className={`md-tab ${mode === 'about' ? 'active' : ''}`}
                      onClick={() => setMode('about')}
                    >
                      {t('tabAbout')}
                    </button>
                    {fw.crossBook ? (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'cross'}
                        className={`md-tab ${mode === 'cross' ? 'active' : ''}`}
                        onClick={() => setMode('cross')}
                      >
                        {t('tabCross')}
                      </button>
                    ) : (
                      // disabled 控制項不觸發滑鼠事件，Tooltip 掛在外層 wrapper
                      <Tooltip label={t('noCross')}>
                        <button type="button" role="tab" aria-selected={false} className="md-tab" disabled>
                          {t('tabCross')}
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </header>
                {mode === 'about' && (
                  <div className="md-reading">
                    <AboutMode fw={fw} sections={sections} />
                    <AboutTOC key={fw.key + i18n.language} sections={sections} scrollerRef={contentRef} />
                  </div>
                )}
                {mode === 'cross' && <CrossBookComingSoon crossBook={fw.crossBook} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
