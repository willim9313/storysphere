import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// Static framework data (hardcoded, matching backend archetypes)
interface Archetype {
  id: string;
  name: string;
  core_desire?: string;
  motto?: string;
  talent?: string;
  weakness?: string;
}

interface Framework {
  key: string;
  name: string;
  category: string;
  description: string;
  archetypes: Archetype[];
}

const FRAMEWORKS: Framework[] = [
  {
    key: 'jung',
    name: 'Jung 原型',
    category: '角色分析',
    description: 'Carl Jung 的 12 原型理論，從集體無意識中辨識角色的核心驅力與行為模式。',
    archetypes: [
      { id: 'innocent', name: '天真者', core_desire: '達到幸福', motto: '自由地做你自己', talent: '信任與樂觀', weakness: '天真、容易受傷' },
      { id: 'orphan', name: '孤兒', core_desire: '與他人連結', motto: '所有人都平等', talent: '現實感與同理心', weakness: '犬儒主義' },
      { id: 'hero', name: '英雄', core_desire: '證明自己的價值', motto: '凡事皆有可能', talent: '能力與勇氣', weakness: '傲慢、好戰' },
      { id: 'caregiver', name: '照顧者', core_desire: '保護他人', motto: '愛你的鄰舍', talent: '同情與慷慨', weakness: '殉道' },
      { id: 'explorer', name: '探險家', core_desire: '自由探索', motto: '別圍繞著我築牆', talent: '獨立與冒險', weakness: '無目的漂泊' },
      { id: 'rebel', name: '反叛者', core_desire: '打破規則', motto: '規則是為了打破的', talent: '大膽創新', weakness: '破壞性' },
      { id: 'lover', name: '情人', core_desire: '親密關係', motto: '你是唯一', talent: '熱情與感恩', weakness: '失去自我' },
      { id: 'creator', name: '創造者', core_desire: '創造持久價值', motto: '想像力是關鍵', talent: '創造力與想像力', weakness: '完美主義' },
      { id: 'jester', name: '弄臣', core_desire: '活在當下', motto: '只活一次', talent: '歡樂', weakness: '輕浮' },
      { id: 'sage', name: '智者', core_desire: '尋找真理', motto: '真理使你自由', talent: '智慧與分析', weakness: '脫離現實' },
      { id: 'magician', name: '魔法師', core_desire: '理解宇宙法則', motto: '讓事情發生', talent: '洞察力', weakness: '操縱他人' },
      { id: 'ruler', name: '統治者', core_desire: '掌控', motto: '權力不是一切，是唯一', talent: '領導力', weakness: '獨裁' },
    ],
  },
  {
    key: 'schmidt',
    name: 'Schmidt 類型',
    category: '角色分析',
    description: 'Victoria Lynn Schmidt 的 45 個角色類型，基於英雄與反英雄的性別對偶分類。',
    archetypes: [
      { id: 'boss', name: '老闆', core_desire: '掌控局面' },
      { id: 'seductress', name: '誘惑者', core_desire: '吸引他人' },
      { id: 'artist', name: '藝術家', core_desire: '自我表達' },
      { id: 'waif', name: '流浪者', core_desire: '尋找歸屬' },
      { id: 'free_spirit', name: '自由靈魂', core_desire: '不受約束' },
    ],
  },
];

export default function FrameworksPage() {
  const [searchParams] = useSearchParams();
  const [selectedKey, setSelectedKey] = useState<string>(
    searchParams.get('framework') || 'jung',
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTocId, setActiveTocId] = useState<string>('');

  const framework = FRAMEWORKS.find((f) => f.key === selectedKey) ?? FRAMEWORKS[0];

  // Auto-select from query param
  useEffect(() => {
    const param = searchParams.get('framework');
    if (param && FRAMEWORKS.some((f) => f.key === param)) {
      setSelectedKey(param);
    }
  }, [searchParams]);

  // Intersection observer for TOC tracking
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveTocId(entry.target.id);
          }
        }
      },
      { root: container, threshold: 0.3 },
    );

    const sections = container.querySelectorAll('[data-archetype]');
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [framework]);

  const scrollToArchetype = useCallback((id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Group frameworks by category
  const grouped = new Map<string, Framework[]>();
  for (const f of FRAMEWORKS) {
    const list = grouped.get(f.category) ?? [];
    list.push(f);
    grouped.set(f.category, list);
  }

  return (
    <div className="flex h-full">
      {/* Column 1: Framework List */}
      <div
        className="flex-shrink-0 overflow-y-auto p-3"
        style={{
          width: 200,
          borderRight: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {[...grouped.entries()].map(([category, items]) => (
          <div key={category} className="mb-4">
            <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--fg-muted)' }}>
              {category}
            </h3>
            {items.map((f) => (
              <button
                key={f.key}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left mb-0.5"
                style={{
                  backgroundColor: selectedKey === f.key ? 'var(--bg-tertiary)' : 'transparent',
                  color: selectedKey === f.key ? 'var(--accent)' : 'var(--fg-primary)',
                }}
                onClick={() => setSelectedKey(f.key)}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                <div>
                  <div className="text-xs font-medium">{f.name}</div>
                  <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    {f.archetypes.length} 類型
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Column 2: TOC */}
      <div
        className="flex-shrink-0 overflow-y-auto p-3"
        style={{
          width: 180,
          borderRight: '1px solid var(--border)',
        }}
      >
        <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--fg-muted)' }}>
          目錄
        </h3>
        {framework.archetypes.map((a, idx) => (
          <button
            key={a.id}
            className="flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs mb-0.5"
            style={{
              backgroundColor: activeTocId === a.id ? 'var(--bg-tertiary)' : 'transparent',
              color: activeTocId === a.id ? 'var(--accent)' : 'var(--fg-secondary)',
            }}
            onClick={() => scrollToArchetype(a.id)}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-muted)' }}
            >
              {idx + 1}
            </span>
            {a.name}
          </button>
        ))}
      </div>

      {/* Column 3: Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
            >
              {framework.name}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-muted)' }}
            >
              {framework.category}
            </span>
          </div>
          <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            全站參考文件，不屬於特定書籍
          </span>
        </div>

        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
          {framework.description}
        </p>

        {/* Archetype cards */}
        <div className="space-y-4">
          {framework.archetypes.map((a, idx) => (
            <div
              key={a.id}
              id={a.id}
              data-archetype
              className="rounded-lg p-4"
              style={{ backgroundColor: 'white', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--accent)' }}
                >
                  {idx + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
                    {a.name}
                  </h3>
                  <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    {a.id}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 text-xs" style={{ color: 'var(--fg-secondary)' }}>
                {a.core_desire && <p><strong>核心驅力：</strong>{a.core_desire}</p>}
                {a.motto && <p><strong>座右銘：</strong>{a.motto}</p>}
                {a.talent && <p><strong>天賦：</strong>{a.talent}</p>}
                {a.weakness && <p><strong>弱點：</strong>{a.weakness}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
