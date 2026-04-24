import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getFrameworks } from '@/data/frameworksData';

export default function FrameworksPage() {
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation('frameworks');
  const [selectedKey, setSelectedKey] = useState<string>(
    searchParams.get('framework') || 'jung',
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTocId, setActiveTocId] = useState<string>('');

  const FRAMEWORKS = getFrameworks(i18n.language);
  const framework = FRAMEWORKS.find((f) => f.key === selectedKey) ?? FRAMEWORKS[0];

  useEffect(() => {
    const param = searchParams.get('framework');
    if (param && FRAMEWORKS.some((f) => f.key === param)) {
      setSelectedKey(param);
    }
  }, [searchParams, FRAMEWORKS]);

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

    const sections = container.querySelectorAll('[data-item]');
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [framework]);

  const scrollToItem = useCallback((id: string) => {
    const container = contentRef.current;
    const el = document.getElementById(id);
    if (!container || !el) return;
    const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: offset - 16, behavior: 'smooth' });
  }, []);

  const grouped = new Map<string, typeof FRAMEWORKS>();
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
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--accent)' }} />
                <div>
                  <div className="text-xs font-medium">{f.name}</div>
                  <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    {f.items.length} {f.itemLabel}
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
          {t('toc')}
        </h3>
        {framework.items.map((item, idx) => (
          <button
            key={item.id}
            className="flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs mb-0.5"
            style={{
              backgroundColor: activeTocId === item.id ? 'var(--bg-tertiary)' : 'transparent',
              color: activeTocId === item.id ? 'var(--accent)' : 'var(--fg-secondary)',
            }}
            onClick={() => scrollToItem(item.id)}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-muted)' }}
            >
              {idx + 1}
            </span>
            {item.name}
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
            {t('globalNotice')}
          </span>
        </div>

        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
          {framework.description}
        </p>

        {/* References */}
        <div
          className="rounded-lg px-4 py-3 mb-6"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-xs font-semibold mb-2" style={{ color: 'var(--fg-muted)' }}>
            {t('references')}
          </h2>
          <ol className="space-y-1.5 list-none">
            {framework.references.map((ref) => (
              <li key={`${ref.author}-${ref.year}`} className="text-xs leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
                <span className="font-medium" style={{ color: 'var(--fg-primary)' }}>
                  {ref.author} ({ref.year}).{' '}
                </span>
                <em>{ref.title}</em>
                {'. '}
                {ref.publisher}.
                {ref.note && (
                  <span style={{ color: 'var(--fg-muted)' }}> — {ref.note}</span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* Item cards */}
        <div className="space-y-4">
          {framework.items.map((item, idx) => (
            <div
              key={item.id}
              id={item.id}
              data-item
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
                      {item.name}
                    </h3>
                    {item.badge && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--fg-muted)' }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.subtitle && (
                    <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                      {item.subtitle}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 text-xs" style={{ color: 'var(--fg-secondary)' }}>
                {item.details.map((d) => (
                  <p key={d.label}>
                    <strong>{d.label}：</strong>{d.value}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
