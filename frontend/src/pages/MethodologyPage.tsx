import { useState, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import {
  getFrameworks,
  getFrameworkCategories,
  type Framework,
  type FrameworkItem,
} from '@/data/frameworksData';
import { ConceptDiagram } from '@/components/methodology/ConceptDiagram';
import {
  activeSectionId,
  buildRailGroups,
  firstOfCategory,
  groupItemsByBadge,
  normalizeQuery,
  scaleLabel,
} from '@/components/methodology/methodologyModel';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDismissOverlay } from '@/hooks/useDismissOverlay';
import '@/styles/methodology.css';

// ≤960 視窗：rail 收成 40px 條，展開時覆蓋在內容上（不推擠內容）。
const NARROW_QUERY = '(max-width: 960px)';

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
  hidden?: boolean;
}

function MethodologyRail({ frameworks, selectedKey, onSelect, query, setQuery, hidden }: RailProps) {
  const { t, i18n } = useTranslation('frameworks');
  const categories = getFrameworkCategories(i18n.language);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const searching = normalizeQuery(query) !== '';
  const groups = useMemo(
    () => buildRailGroups(frameworks, categories, query),
    [frameworks, categories, query],
  );

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <nav className="md-rail" id="md-rail" aria-label={t('brand')} hidden={hidden}>
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
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPh')}
          aria-label={t('searchPh')}
        />
      </label>
      <div className="md-rail-scroll">
        <button
          type="button"
          aria-current={selectedKey === 'overview' ? 'page' : undefined}
          className={`md-railitem ${selectedKey === 'overview' ? 'active' : ''}`}
          onClick={() => onSelect('overview')}
        >
          <span className="md-railitem-name">{t('overview')}</span>
        </button>
        {/* 常駐 status 容器：無命中提示出現時讀屏會念出 */}
        <div role="status">
          {searching && groups.length === 0 && (
            <div className="md-rail-empty">
              <p className="md-rail-empty-text">{t('searchEmpty', { q: query.trim() })}</p>
              <button
                type="button"
                className="md-rail-empty-clear"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
              >
                {t('searchClear')}
              </button>
            </div>
          )}
        </div>
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
                    aria-current={selectedKey === fw.key ? 'page' : undefined}
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
  // 點目錄後釘住被點的節（底部的節可能捲不到判定線），直到使用者自己再捲動
  const pinned = useRef<string | null>(null);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (pinned.current) return;
      const rootTop = root.getBoundingClientRect().top;
      const tops = sections.map((s) => ({
        id: s.id,
        top: (document.getElementById(s.id)?.getBoundingClientRect().top ?? Infinity) - rootTop,
      }));
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
      setActive(activeSectionId(tops, root.clientHeight * 0.3, atBottom));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    const unpin = () => {
      pinned.current = null;
    };
    const userEvents = ['wheel', 'keydown', 'pointerdown', 'touchstart'] as const;
    root.addEventListener('scroll', onScroll, { passive: true });
    userEvents.forEach((ev) => root.addEventListener(ev, unpin, { passive: true }));
    raf = requestAnimationFrame(compute);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('scroll', onScroll);
      userEvents.forEach((ev) => root.removeEventListener(ev, unpin));
    };
  }, [sections, scrollerRef]);

  const go = (id: string) => {
    const root = scrollerRef.current;
    const el = document.getElementById(id);
    if (!root || !el) return;
    pinned.current = id;
    setActive(id);
    const offset = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 24;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.scrollTo({ top: offset, behavior: reduceMotion ? 'auto' : 'smooth' });
    // 焦點跟著移到該節，鍵盤使用者接著 Tab 就從那一節開始
    el.focus({ preventScroll: true });
  };

  return (
    <aside className="md-toc">
      <div className="md-toc-label" id="md-toc-label">{t('onThisPage')}</div>
      <nav aria-labelledby="md-toc-label">
        {sections.map((s, i) => (
          <button
            type="button"
            key={s.id}
            aria-current={active === s.id ? 'location' : undefined}
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
            <h3 className="md-wall-label">{g.label}</h3>
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
      <section id={sections[0].id} className="md-section" tabIndex={-1}>
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

      <section id={sections[1].id} className="md-section" tabIndex={-1}>
        <SectionHead no={no(1)} title={t('secConcept')} sub={conceptSub || undefined} />
        <ConceptDiagram fw={fw} />
      </section>

      <section id={sections[2].id} className="md-section" tabIndex={-1}>
        <SectionHead no={no(2)} title={t('secItems')} sub={scaleLabel(fw)} />
        <ItemsGrid fw={fw} />
      </section>

      <section id={sections[3].id} className="md-section" tabIndex={-1}>
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
        <h3 className="md-subhead" id="md-schema-title">{t('secOutput')}</h3>
        {/* 無表頭列的三欄表：用 ARIA table 角色保留 grid 版面 */}
        <div className="md-schema" role="table" aria-labelledby="md-schema-title">
          {fw.output.map((o) => (
            <div className="md-schema-row" role="row" key={o.field}>
              <code className="md-schema-field" role="cell">{o.field}</code>
              <code className="md-schema-type" role="cell">{o.type}</code>
              <span className="md-schema-note" role="cell">{o.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section id={sections[4].id} className="md-section" tabIndex={-1}>
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

      <section id={sections[5].id} className="md-section" tabIndex={-1}>
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
          // 整張卡可點只是滑鼠的大命中區（跳該類第一個方法）；鍵盤／讀屏走卡內各方法按鈕，卡本身不是互動元件
          return (
            <div key={cat.id} className="md-ov-catcard" onClick={() => first && onGoto(first.key)}>
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

  // 分頁跟著方法走：換方法（含上一頁／下一頁）一律回到「理論與方法」
  const [modeState, setModeState] = useState<{ key: string; mode: Mode }>({ key: selectedKey, mode: 'about' });
  const mode: Mode = modeState.key === selectedKey ? modeState.mode : 'about';
  const setMode = (m: Mode) => setModeState({ key: selectedKey, mode: m });
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  // 換方法時捲回頂端（rail 點選與瀏覽器上一頁都走這裡）
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [selectedKey]);

  // 無效的 ?framework= 會顯示總覽，網址也一併清掉，不留下指不到東西的參數
  useEffect(() => {
    if (!paramKey || frameworks.some((f) => f.key === paramKey)) return;
    const next = new URLSearchParams(searchParams);
    next.delete('framework');
    setSearchParams(next, { replace: true });
  }, [paramKey, frameworks, searchParams, setSearchParams]);

  const [narrow, setNarrow] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches,
  );
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => {
      setNarrow(mq.matches);
      setRailOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const railWrapRef = useRef<HTMLDivElement>(null);
  const railToggleRef = useRef<HTMLButtonElement>(null);
  const closeRail = () => setRailOpen(false);
  useDismissOverlay(narrow && railOpen, closeRail, railWrapRef, railToggleRef);
  // 展開時焦點落在目前所在的項目，鍵盤使用者從自己的位置開始
  useEffect(() => {
    if (narrow && railOpen) railWrapRef.current?.querySelector<HTMLElement>('.md-railitem.active')?.focus();
  }, [narrow, railOpen]);

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

  // WAI-ARIA tabs（自動啟用）：←／→ 循環、Home／End；停用的跨書分頁只移焦點、不切換
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const order: Mode[] = ['about', 'cross'];
    const focused = order.findIndex((m) => document.activeElement?.id === `md-tab-${m}`);
    const cur = focused === -1 ? order.indexOf(mode) : focused;
    let next: number;
    if (e.key === 'ArrowRight') next = (cur + 1) % order.length;
    else if (e.key === 'ArrowLeft') next = (cur - 1 + order.length) % order.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = order.length - 1;
    else return;
    e.preventDefault();
    const target = order[next];
    if (target === 'about' || fw?.crossBook) setMode(target);
    document.getElementById(`md-tab-${target}`)?.focus();
  };

  // 每次換方法推一筆歷史紀錄：上一頁回到前一個方法
  const goto = (key: string) => {
    if (key === selectedKey) return;
    const next = new URLSearchParams(searchParams);
    if (key === 'overview') {
      next.delete('framework');
    } else {
      next.set('framework', key);
    }
    setSearchParams(next);
  };

  return (
    <div className="md-app">
      <div className={`md-railwrap ${narrow ? 'narrow' : ''}`} ref={railWrapRef}>
        {narrow && (
          <button
            ref={railToggleRef}
            type="button"
            className="md-railtoggle"
            aria-expanded={railOpen}
            aria-controls="md-rail"
            aria-label={t(railOpen ? 'railClose' : 'railOpen')}
            onClick={() => setRailOpen((o) => !o)}
          >
            {railOpen ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeftOpen size={16} aria-hidden="true" />}
          </button>
        )}
        <MethodologyRail
          frameworks={frameworks}
          selectedKey={selectedKey}
          onSelect={(key) => {
            goto(key);
            setRailOpen(false);
          }}
          query={query}
          setQuery={setQuery}
          hidden={narrow && !railOpen}
        />
      </div>

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
                  <div className="md-tabs" role="tablist" aria-label={fw.name} onKeyDown={onTabKeyDown}>
                    <button
                      type="button"
                      role="tab"
                      id="md-tab-about"
                      aria-selected={mode === 'about'}
                      aria-controls="md-tabpanel"
                      tabIndex={mode === 'about' ? 0 : -1}
                      className={`md-tab ${mode === 'about' ? 'active' : ''}`}
                      onClick={() => setMode('about')}
                    >
                      {t('tabAbout')}
                    </button>
                    {fw.crossBook ? (
                      <button
                        type="button"
                        role="tab"
                        id="md-tab-cross"
                        aria-selected={mode === 'cross'}
                        aria-controls="md-tabpanel"
                        tabIndex={mode === 'cross' ? 0 : -1}
                        className={`md-tab ${mode === 'cross' ? 'active' : ''}`}
                        onClick={() => setMode('cross')}
                      >
                        {t('tabCross')}
                      </button>
                    ) : (
                      // aria-disabled（不用原生 disabled）：方向鍵仍走得到、讀屏念得出原因；啟動無作用
                      <Tooltip label={t('noCross')}>
                        <button
                          type="button"
                          role="tab"
                          id="md-tab-cross"
                          aria-selected={false}
                          aria-disabled="true"
                          aria-describedby="md-nocross"
                          tabIndex={-1}
                          className="md-tab"
                        >
                          {t('tabCross')}
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  {!fw.crossBook && <span id="md-nocross" className="sr-only">{t('noCross')}</span>}
                </header>
                <div role="tabpanel" id="md-tabpanel" aria-labelledby={`md-tab-${mode}`}>
                  {mode === 'about' && (
                    <div className="md-reading">
                      <AboutMode fw={fw} sections={sections} />
                      <AboutTOC key={fw.key + i18n.language} sections={sections} scrollerRef={contentRef} />
                    </div>
                  )}
                  {mode === 'cross' && <CrossBookComingSoon crossBook={fw.crossBook} />}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
