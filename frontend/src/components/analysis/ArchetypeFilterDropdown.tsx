import { useEffect, useState } from 'react';
import { Flag, X, Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getFrameworks } from '@/data/frameworksData';
import type { AnalysisItem } from '@/api/types';

interface ArchetypeFilterDropdownProps {
  framework: 'jung' | 'schmidt';
  analyzed: AnalysisItem[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/** Searchable multi-select popover, left panel (#14). Filters the analyzed
 * list by primary archetype name for the active framework; facet counts are
 * derived client-side from #6a `analyzed[].archetypes`. */
export function ArchetypeFilterDropdown({
  framework,
  analyzed,
  selected,
  onChange,
}: ArchetypeFilterDropdownProps) {
  const { t, i18n } = useTranslation('analysis');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Esc closes only this popover (capture phase + stopPropagation so it
  // doesn't also trigger the framework-compare drawer's own Esc listener).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const taxonomy = getFrameworks(i18n.language).find((f) => f.key === framework)?.items ?? [];

  const facet = new Map<string, number>();
  analyzed.forEach((item) => {
    const name = item.archetypes?.[framework];
    if (name) facet.set(name, (facet.get(name) ?? 0) + 1);
  });

  const options = taxonomy
    .filter((item) => !search.trim() || item.name.includes(search.trim()))
    .sort((a, b) => (facet.get(b.name) ?? 0) - (facet.get(a.name) ?? 0));

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((v) => v !== name) : [...selected, name]);
  };

  return (
    <div className="ca-archfilter">
      <button
        type="button"
        className={'ca-archfilter-trigger' + (selected.length ? ' active' : '')}
        onClick={() => setOpen((v) => !v)}
      >
        <Flag size={13} />
        <span className="ca-archfilter-trigger-label">
          {selected.length
            ? t('character.archFilter.selectedCount', { count: selected.length })
            : t('character.archFilter.label')}
        </span>
        {selected.length ? (
          <span
            role="button"
            tabIndex={0}
            className="ca-archfilter-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
          >
            <X size={12} />
          </span>
        ) : (
          <span className="ca-archfilter-chevron">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="ca-archfilter-backdrop"
            onClick={() => {
              setOpen(false);
              setSearch('');
            }}
          />
          <div className="ca-archfilter-popover">
            <div className="ca-archfilter-search">
              <Search size={12} />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('character.archFilter.searchPlaceholder', {
                  framework: framework === 'jung' ? 'Jung 12' : 'Schmidt 45',
                })}
              />
            </div>
            <div className="ca-archfilter-options">
              {options.length ? (
                options.map((item) => {
                  const on = selected.includes(item.name);
                  const count = facet.get(item.name) ?? 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={'ca-archfilter-option' + (on ? ' selected' : '')}
                      onClick={() => toggle(item.name)}
                    >
                      <span className={'ca-archfilter-check' + (on ? ' checked' : '')}>
                        {on && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className={'ca-archfilter-option-name' + (count ? '' : ' muted')}>
                        {item.name}
                      </span>
                      <span className="ca-archfilter-option-count">{count}</span>
                    </button>
                  );
                })
              ) : (
                <div className="ca-archfilter-empty">{t('character.archFilter.noMatch')}</div>
              )}
            </div>
            {selected.length > 0 && (
              <button type="button" className="ca-archfilter-clearall" onClick={() => onChange([])}>
                {t('character.archFilter.clearAll')}
              </button>
            )}
          </div>
        </>
      )}

      {selected.length > 0 && (
        <div className="ca-archfilter-pills">
          {selected.map((name) => (
            <span key={name} className="ca-archfilter-pill" onClick={() => toggle(name)}>
              {name}
              <X size={10} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
