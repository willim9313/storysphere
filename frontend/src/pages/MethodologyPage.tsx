import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ChevronRight,
  Search,
  Sparkles,
  Users,
  Route,
  Activity,
  Grid3x3,
  Quote,
  ArrowRight,
} from 'lucide-react';
import {
  getFrameworks,
  getFrameworkCategories,
  type Framework,
  type FrameworkCategory,
} from '@/data/frameworksData';
import { ConceptDiagram } from '@/components/methodology/ConceptDiagram';
import '@/styles/methodology.css';

type Mode = 'about' | 'cross';
type Tier = 'established' | 'presumed' | 'tentative';

const CAT_ICON: Record<FrameworkCategory, typeof Users> = {
  character: Users,
  arc: Route,
  tension: Activity,
  symbol: Sparkles,
};

function HonestCallout() {
  const { t } = useTranslation('frameworks');
  return (
    <div className="md-callout" role="note">
      <span className="md-callout-icon">
        <AlertTriangle size={16} color="var(--color-warning)" />
      </span>
      <div>
        <div className="md-callout-title">{t('honestTitle')}</div>
        <p className="md-callout-body">{t('honestBody')}</p>
      </div>
    </div>
  );
}

function NoConfidenceNote() {
  const { t } = useTranslation('frameworks');
  return (
    <div className="md-callout" role="note">
      <span className="md-callout-icon">
        <AlertTriangle size={16} color="var(--color-warning)" />
      </span>
      <div>
        <div className="md-callout-title">{t('noConfidenceTitle')}</div>
        <p className="md-callout-body">{t('noConfidenceBody')}</p>
      </div>
    </div>
  );
}

function tierColors(tier: Tier) {
  if (tier === 'established') {
    return {
      bg: 'var(--status-complete-bg)',
      fg: 'var(--status-complete-fg)',
      edge: 'var(--status-complete-border)',
    };
  }
  if (tier === 'presumed') {
    return {
      bg: 'var(--status-partial-bg)',
      fg: 'var(--status-partial-fg)',
      edge: 'var(--status-partial-border)',
    };
  }
  return {
    bg: 'var(--status-empty-bg)',
    fg: 'var(--status-empty-fg)',
    edge: 'var(--status-empty-border)',
  };
}

function TierLegend() {
  const { t } = useTranslation('frameworks');
  const tiers: Tier[] = ['established', 'presumed', 'tentative'];
  return (
    <div className="md-tierlegend">
      {tiers.map((tier) => {
        const c = tierColors(tier);
        return (
          <div className="md-tier" key={tier} style={{ borderColor: c.edge }}>
            <div className="md-tier-head">
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  padding: '1px 8px',
                  borderRadius: 20,
                  border: '1px solid',
                  background: c.bg,
                  color: c.fg,
                  borderColor: c.edge,
                }}
              >
                {t(`tier.${tier}`)}
              </span>
              <span className="md-tier-range">{t(`tier.${tier}Range`)}</span>
            </div>
            <p className="md-tier-desc">{t(`tier.${tier}Desc`)}</p>
          </div>
        );
      })}
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
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return frameworks;
    return frameworks.filter(
      (fw) =>
        fw.name.toLowerCase().includes(q) ||
        fw.items.some((it) => it.name.toLowerCase().includes(q)) ||
        fw.category.toLowerCase().includes(q),
    );
  }, [frameworks, q]);

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const renderItem = (fw: Framework) => (
    <button
      key={fw.key}
      className={`md-railitem ${selectedKey === fw.key ? 'active' : ''}`}
      onClick={() => onSelect(fw.key)}
    >
      <span className="md-railitem-dot" />
      <span className="md-railitem-text">
        <div className="md-railitem-name">{fw.name}</div>
        <div className="md-railitem-meta">
          {fw.items.length} {fw.itemLabel}
        </div>
      </span>
    </button>
  );

  return (
    <div className="md-rail">
      <div className="md-rail-head">
        <div className="md-rail-brand">
          {t('brand')}
          <span className="tag">{t('placeholder')}</span>
        </div>
        <div className="md-rail-sub">{t('brandSub')}</div>
      </div>
      <div className="md-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPh')}
        />
      </div>
      <div className="md-rail-scroll">
        <button
          className={`md-railitem ${selectedKey === 'overview' ? 'active' : ''}`}
          onClick={() => onSelect('overview')}
          style={{ marginBottom: 8 }}
        >
          <Sparkles size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span className="md-railitem-text">
            <div className="md-railitem-name">{t('overview')}</div>
          </span>
        </button>
        {categories.map((cat) => {
          const list = filtered.filter((f) => f.categoryId === cat.id);
          if (!list.length) return null;
          const isOpen = q ? true : !collapsed[cat.id];
          return (
            <div className="md-railgroup" key={cat.id}>
              <button className="md-railgroup-label" aria-expanded={isOpen} onClick={() => toggle(cat.id)}>
                <ChevronRight size={12} className={`md-railgroup-chev ${isOpen ? 'open' : ''}`} />
                <span className="md-railgroup-name">{cat.name}</span>
                <span className="md-railgroup-count">{list.length}</span>
              </button>
              {isOpen && list.map(renderItem)}
            </div>
          );
        })}
      </div>
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
    const offset = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 14;
    root.scrollTo({ top: offset, behavior: 'smooth' });
  };

  return (
    <aside className="md-toc">
      <div className="md-toc-inner">
        <div className="md-toc-label">{t('onThisPage')}</div>
        <nav>
          {sections.map((s, i) => (
            <button
              key={s.id}
              className={`md-toc-item ${active === s.id ? 'active' : ''}`}
              onClick={() => go(s.id)}
            >
              <span className="md-toc-n">{String(i + 1).padStart(2, '0')}</span>
              {s.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
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

  return (
    <article className="md-article">
      <section id={sections[0].id} className="md-section">
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
        <div className="md-sechead">
          <h2 className="md-sechead-title">
            <Sparkles size={15} color="var(--accent)" />
            {t('secConcept')}
          </h2>
          {conceptSub && <span className="md-sechead-sub">{conceptSub}</span>}
        </div>
        <ConceptDiagram fw={fw} />
      </section>

      <section id={sections[2].id} className="md-section">
        <div className="md-sechead">
          <h2 className="md-sechead-title">
            <Grid3x3 size={15} color="var(--accent)" />
            {t('secItems')}
          </h2>
          <span className="md-sechead-sub">
            {fw.items.length} {fw.itemLabel}
          </span>
        </div>
        <div className="md-items">
          {fw.items.map((it, i) => (
            <div key={it.id} className="md-card md-itemcard">
              <div className="md-itemcard-top">
                <span className="md-itemcard-num">{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="md-itemcard-name">{it.name}</div>
                  {it.subtitle && <div className="md-itemcard-sub">{it.subtitle}</div>}
                </div>
                {it.badge && <span className="md-itemcard-badge">{it.badge}</span>}
              </div>
              {it.details.slice(0, 2).map((d) => (
                <div className="md-itemcard-detail" key={d.label}>
                  <b>{d.label}</b>
                  {' '}
                  {d.value}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section id={sections[3].id} className="md-section">
        <div className="md-sechead">
          <h2 className="md-sechead-title">
            <Route size={15} color="var(--accent)" />
            {t('secPipeline')}
          </h2>
          <span className="md-sechead-sub">{t('pipelineSub')}</span>
        </div>
        <div className="md-card">
          <div className="md-pipe">
            {fw.pipeline.map((s, i) => (
              <span key={s.key} style={{ display: 'contents' }}>
                <div className="md-pipe-step">
                  <span className="md-pipe-kicker">{pipeMeta[i]}</span>
                  <span className="md-pipe-title">{i + 1}</span>
                  <span className="md-pipe-desc">{s.what}</span>
                </div>
                {i < fw.pipeline.length - 1 && (
                  <div className="md-pipe-arrow">
                    <ArrowRight size={16} />
                  </div>
                )}
              </span>
            ))}
          </div>
        </div>
        <div style={{ height: 'var(--space-md)' }} />
        <div
          style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--fg-muted)',
            marginBottom: 6,
          }}
        >
          {t('secOutput')}
        </div>
        <div className="md-card md-schema">
          {fw.output.map((o) => (
            <div className="md-schema-row" key={o.field}>
              <span className="md-schema-field">{o.field}</span>
              <span className="md-schema-type">{o.type}</span>
              <span className="md-schema-note">{o.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section id={sections[4].id} className="md-section">
        <div className="md-sechead">
          <h2 className="md-sechead-title">
            <Activity size={15} color="var(--accent)" />
            {t('secConfidence')}
          </h2>
        </div>
        {fw.hasConfidence ? (
          <>
            <p className="md-lead" style={{ marginBottom: 'var(--space-md)' }}>
              {t('confIntro')}
            </p>
            <HonestCallout />
            <div style={{ height: 'var(--space-md)' }} />
            <div
              style={{
                fontSize: '0.625rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--fg-muted)',
                marginBottom: 6,
              }}
            >
              {t('tierLegend')}
            </div>
            <TierLegend />
          </>
        ) : (
          <NoConfidenceNote />
        )}
      </section>

      <section id={sections[5].id} className="md-section">
        <div className="md-sechead">
          <h2 className="md-sechead-title">
            <Quote size={15} color="var(--accent)" />
            {t('secTheory')}
          </h2>
        </div>
        <div className="md-card md-refs">
          {fw.references.map((r, i) => (
            <div className="md-ref" key={`${r.author}-${r.year}-${i}`}>
              <span className="md-ref-marker">[{i + 1}]</span>
              <div className="md-ref-body">
                <span className="au">
                  {r.author} ({r.year}).{' '}
                </span>
                <em>{r.title}</em>. {r.publisher}.
                {r.note && <span className="md-ref-note"> — {r.note}</span>}
              </div>
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

  return (
    <div>
      <div className="md-ov-hero">
        <h1 className="md-ov-title">
          {t('brand')}
          <span className="tag">{t('placeholder')}</span>
        </h1>
        <p className="md-ov-lead">{t('ovLead')}</p>
      </div>

      <div className="md-sechead">
        <h2 className="md-sechead-title">
          <Sparkles size={15} color="var(--accent)" />
          {t('secConcept')}
        </h2>
      </div>
      <div className="md-ov-cats">
        {categories.map((cat) => {
          const list = frameworks.filter((f) => f.categoryId === cat.id);
          if (!list.length) return null;
          const CatIcon = CAT_ICON[cat.id];
          return (
            <div
              key={cat.id}
              className="md-ov-catcard"
              onClick={() => list[0] && onGoto(list[0].key)}
              role="button"
              tabIndex={0}
            >
              <div className="md-ov-cathead">
                <span className="md-ov-caticon">
                  <CatIcon size={18} />
                </span>
                <span className="md-ov-catname">{cat.name}</span>
              </div>
              <div className="md-ov-catmethods">
                {list.map((fw) => (
                  <button
                    key={fw.key}
                    className="md-ov-catmethod"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGoto(fw.key);
                    }}
                  >
                    {fw.name}
                    <span className="cnt">
                      {fw.items.length} {fw.itemLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 'var(--space-2xl)' }} />
    </div>
  );
}

function CrossBookComingSoon({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('frameworks');
  return (
    <div className="md-cross-coming">
      <span className="md-cross-coming-tag">
        {disabled ? t('noCross') : t('crossSoonTitle')}
      </span>
      <h3 className="md-cross-coming-title">
        {disabled ? t('tabCross') : t('crossSoonTitle')}
      </h3>
      <p className="md-cross-coming-body">
        {disabled ? t('noCross') : t('crossSoonBody')}
      </p>
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
        <div className="md-topbar">
          <div className="md-topbar-titlewrap">
            {fw ? (
              <>
                <div className="md-topbar-titlerow">
                  <span className="md-topbar-title">{fw.name}</span>
                  <span className="md-cat-chip">{fw.category}</span>
                </div>
                <span className="md-topbar-sub">{t('globalNotice')}</span>
              </>
            ) : (
              <>
                <span className="md-topbar-title">{t('brand')}</span>
                <span className="md-topbar-sub">{t('globalNotice')}</span>
              </>
            )}
          </div>

          {fw && (
            <div className="md-modetabs">
              <button
                className={`md-modetab ${mode === 'about' ? 'active' : ''}`}
                onClick={() => setMode('about')}
              >
                {t('tabAbout')}
              </button>
              <button
                className={`md-modetab ${mode === 'cross' ? 'active' : ''}`}
                disabled={!fw.crossBook}
                title={!fw.crossBook ? t('noCross') : ''}
                onClick={() => fw.crossBook && setMode('cross')}
              >
                {t('tabCross')}
              </button>
            </div>
          )}
        </div>

        <div className="md-content" ref={contentRef}>
          {!fw && (
            <div className="md-content-inner">
              <OverviewPage frameworks={frameworks} onGoto={goto} />
            </div>
          )}
          {fw && mode === 'about' && (
            <div className="md-reading">
              <AboutMode fw={fw} sections={sections} />
              <AboutTOC
                key={fw.key + i18n.language}
                sections={sections}
                scrollerRef={contentRef}
              />
            </div>
          )}
          {fw && mode === 'cross' && (
            <div className="md-content-inner">
              <CrossBookComingSoon disabled={!fw.crossBook} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
