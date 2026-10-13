/**
 * Filter contents for the timeline toolbar's filter popover.
 *
 * Moved from `TimelinePage.tsx` unchanged in substance: the design canvas
 * proposed four hardcoded demo conditions, which cannot hold this book's
 * 8 event types and 67 characters. The shell is new, the content is not.
 */

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import {
  createDefaultFilter,
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
      // Picking an option no event has can only empty the result. An active
      // one stays clickable so it can be taken off again.
      disabled={count === 0 && !active}
    >
      {label}
      {count !== undefined && <span className="tl-filter-chip-n">{count}</span>}
    </button>
  );
}

export interface FilterSheetProps {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  options: FilterOptions;
  modeLabel: (mode: string) => string;
  eventTypeLabel: (type: string) => string;
  /** How many events each option value would match, keyed `section:value`. */
  counts: Map<string, number>;
}

export function FilterSheet({
  filter,
  onChange,
  options,
  modeLabel,
  eventTypeLabel,
  counts,
}: FilterSheetProps) {
  const { t } = useTranslation('analysis');
  const [charSearch, setCharSearch] = useState('');
  // Mounted only while open: focus moves to the title, Tab stays inside, and
  // closing hands focus back to the 篩選 button that opened it.
  const dialogRef = useDialogFocus(true);
  const titleId = useId();

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
    <div className="tl-filter-sheet" role="dialog" aria-labelledby={titleId} ref={dialogRef}>
      <div className="tl-filter-sheet-head">
        <span className="tl-filter-sheet-title" id={titleId} tabIndex={-1}>
          {t('timeline.toolbar.filter')}
        </span>
        <button type="button" className="tl-filter-sheet-clear" onClick={reset}>
          {t('timeline.clearAll')}
        </button>
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

      {/* Modes are derived from story order, so a book without ranks has only
          未明 — one option filters nothing, and the section stays hidden until
          a second mode exists (same rule as an empty 地點). */}
      {options.narrativeModes.length > 1 && (
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
      )}

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
    </div>
  );
}
