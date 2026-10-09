import { useEffect, useState } from 'react';
import { Flag, X, Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getFrameworks } from '@/data/frameworksData';
import type { AnalysisItem } from '@/api/types';
import { archetypeKey } from './characterModel';

interface ArchetypeFilterDropdownProps {
  framework: 'jung' | 'schmidt';
  analyzed: AnalysisItem[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/** Searchable multi-select popover, left panel (#14). Filters the analyzed
 * list by primary archetype for the active framework; facet counts are
 * derived client-side from #6a `analyzed[].archetypes`. Everything is keyed by
 * archetype id (`archetypeKey`): #6a names are in the book's language, the
 * taxonomy here is in the interface language. */
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
    if (name) {
      const key = archetypeKey(framework, name);
      facet.set(key, (facet.get(key) ?? 0) + 1);
    }
  });

  const query = search.trim().toLowerCase();
  const options = taxonomy
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .sort((a, b) => (facet.get(b.id) ?? 0) - (facet.get(a.id) ?? 0));
  const nameOfKey = (key: string) => taxonomy.find((item) => item.id === key)?.name ?? key;

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((v) => v !== key) : [...selected, key]);
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
                  const on = selected.includes(item.id);
                  const count = facet.get(item.id) ?? 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={'ca-archfilter-option' + (on ? ' selected' : '')}
                      onClick={() => toggle(item.id)}
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
          {selected.map((key) => (
            <span key={key} className="ca-archfilter-pill" onClick={() => toggle(key)}>
              {nameOfKey(key)}
              <X size={10} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
