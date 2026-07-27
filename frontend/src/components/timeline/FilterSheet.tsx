/**
 * Filter contents for the timeline toolbar's filter popover.
 *
 * Moved from `TimelinePage.tsx` unchanged in substance: the design canvas
 * proposed four hardcoded demo conditions, which cannot hold this book's
 * 8 event types and 67 characters. The shell is new, the content is not.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import {
  createDefaultFilter,
  type FilterMode,
  type FilterOptions,
  type FilterState,
} from './filterState';

function FilterChip({
  active,
  onClick,
  label,
  variant,
  noDot,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
  variant?: string;
  noDot?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      className={`tl-filter-chip${variant ? ` ${variant}` : ''}${noDot ? ' no-dot' : ''}${
        active ? ' active' : ''
      }`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      {count !== undefined && <span className="tl-filter-chip-n">{count}</span>}
    </button>
  );
}

export interface FilterSheetProps {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  onClose: () => void;
  options: FilterOptions;
  modeLabel: (mode: string) => string;
  eventTypeLabel: (type: string) => string;
  /** How many events each option value would match, keyed `section:value`. */
  counts: Map<string, number>;
  mode: FilterMode;
  onModeChange: (m: FilterMode) => void;
}

export function FilterSheet({
  filter,
  onChange,
  onClose,
  options,
  modeLabel,
  eventTypeLabel,
  counts,
  mode,
  onModeChange,
}: FilterSheetProps) {
  const { t } = useTranslation('analysis');
  const [charSearch, setCharSearch] = useState('');

  const toggleSet = (key: keyof FilterState, value: string) => {
    const next = { ...filter, [key]: new Set(filter[key]) };
    const set = next[key];
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange(next);
  };

  const reset = () => onChange(createDefaultFilter());
  const countOf = (section: string, value: string) => counts.get(`${section}:${value}`) ?? 0;

  const filteredChars = options.characters.filter((c) =>
    c.name.toLowerCase().includes(charSearch.toLowerCase()),
  );

  return (
    <div className="tl-filter-sheet" role="dialog" aria-label={t('timeline.filter')}>
      {/* Both display modes are kept: dim preserves position on the stave, */}
      {/* "only" makes a long book readable. Not an either/or. */}
      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterModeLabel')}</div>
        <div className="tl-segmented" role="group">
          <button
            type="button"
            className={`tl-segmented-item${mode === 'dim' ? ' active' : ''}`}
            onClick={() => onModeChange('dim')}
            aria-pressed={mode === 'dim'}
          >
            {t('timeline.filterModeDim')}
          </button>
          <button
            type="button"
            className={`tl-segmented-item${mode === 'only' ? ' active' : ''}`}
            onClick={() => onModeChange('only')}
            aria-pressed={mode === 'only'}
          >
            {t('timeline.filterModeOnly')}
          </button>
        </div>
        <div className="tl-filter-mode-hint">
          {mode === 'dim' ? t('timeline.filterModeDimHint') : t('timeline.filterModeOnlyHint')}
        </div>
      </div>

      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterSections.eventTypes')}</div>
        <div className="tl-filter-chips">
          {options.eventTypes.map((v) => (
            <FilterChip
              key={v}
              label={eventTypeLabel(v)}
              count={countOf('eventTypes', v)}
              active={filter.eventTypes.has(v)}
              onClick={() => toggleSet('eventTypes', v)}
            />
          ))}
        </div>
      </div>

      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterSections.narrativeModes')}</div>
        <div className="tl-filter-chips">
          {options.narrativeModes.map((v) => (
            <FilterChip
              key={v}
              label={modeLabel(v)}
              count={countOf('narrativeModes', v)}
              active={filter.narrativeModes.has(v)}
              onClick={() => toggleSet('narrativeModes', v)}
              variant={`narrative-${v}`}
            />
          ))}
        </div>
      </div>

      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterSections.importance')}</div>
        <div className="tl-filter-chips">
          <FilterChip
            label="KERNEL"
            variant="importance-kernel"
            count={countOf('importance', 'KERNEL')}
            active={filter.importance.has('KERNEL')}
            onClick={() => toggleSet('importance', 'KERNEL')}
            noDot
          />
          <FilterChip
            label="SATELLITE"
            variant="importance-satellite"
            count={countOf('importance', 'SATELLITE')}
            active={filter.importance.has('SATELLITE')}
            onClick={() => toggleSet('importance', 'SATELLITE')}
            noDot
          />
        </div>
      </div>

      <div className="tl-filter-sheet-section">
        <div className="tl-filter-sheet-label">{t('timeline.filterSections.characters')}</div>
        <div className="tl-filter-search">
          <span className="tl-filter-search-icon">
            <Search size={12} />
          </span>
          <input
            type="text"
            value={charSearch}
            onChange={(e) => setCharSearch(e.target.value)}
            placeholder={t('timeline.charSearch')}
          />
        </div>
        <div className="tl-filter-chips tl-filter-chips-scroll">
          {filteredChars.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              variant="character"
              count={countOf('characters', c.id)}
              active={filter.characters.has(c.id)}
              onClick={() => toggleSet('characters', c.id)}
            />
          ))}
        </div>
      </div>

      {options.locations.length > 0 && (
        <div className="tl-filter-sheet-section">
          <div className="tl-filter-sheet-label">{t('timeline.filterSections.locations')}</div>
          <div className="tl-filter-chips">
            {options.locations.map((l) => (
              <FilterChip
                key={l.id}
                label={l.name}
                variant="location"
                count={countOf('locations', l.id)}
                active={filter.locations.has(l.id)}
                onClick={() => toggleSet('locations', l.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="tl-filter-sheet-foot">
        <button type="button" className="tl-btn" onClick={reset}>
          {t('timeline.reset')}
        </button>
        <button type="button" className="tl-btn tl-btn-primary" onClick={onClose}>
          {t('timeline.apply')}
        </button>
      </div>
    </div>
  );
}
