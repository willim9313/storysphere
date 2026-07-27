/**
 * Timeline filter state.
 *
 * Extracted verbatim from the pre-revamp `TimelinePage.tsx` — the revamp
 * replaces the filter's *shell* (a popover in the new toolbar) but keeps its
 * content and semantics: five AND-combined sections, one of which holds every
 * character in the book.
 */

import type { TimelineEvent } from '@/api/types';

export interface FilterState {
  eventTypes: Set<string>;
  narrativeModes: Set<string>;
  characters: Set<string>;
  locations: Set<string>;
  importance: Set<string>;
}

export interface FilterOptions {
  eventTypes: string[];
  narrativeModes: string[];
  characters: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}

/** How unmatched events are rendered. Both modes are useful, see UI_SPEC §3.7. */
export type FilterMode = 'dim' | 'only';

export function createDefaultFilter(): FilterState {
  return {
    eventTypes: new Set(),
    narrativeModes: new Set(),
    characters: new Set(),
    locations: new Set(),
    importance: new Set(),
  };
}

export function isFilterActive(f: FilterState): boolean {
  return (
    f.eventTypes.size > 0 ||
    f.narrativeModes.size > 0 ||
    f.characters.size > 0 ||
    f.locations.size > 0 ||
    f.importance.size > 0
  );
}

export function activeFilterCount(f: FilterState): number {
  let count = 0;
  if (f.eventTypes.size > 0) count++;
  if (f.narrativeModes.size > 0) count++;
  if (f.characters.size > 0) count++;
  if (f.locations.size > 0) count++;
  if (f.importance.size > 0) count++;
  return count;
}

export function eventPassesFilter(event: TimelineEvent, filter: FilterState): boolean {
  if (filter.eventTypes.size > 0 && !filter.eventTypes.has(event.eventType)) return false;
  if (filter.narrativeModes.size > 0 && !filter.narrativeModes.has(event.narrativeMode)) {
    return false;
  }
  if (filter.importance.size > 0 && !filter.importance.has(event.eventImportance ?? '')) {
    return false;
  }
  if (filter.characters.size > 0) {
    const hasMatch = event.participants.some(
      (p) => p.type === 'character' && filter.characters.has(p.id),
    );
    if (!hasMatch) return false;
  }
  if (filter.locations.size > 0) {
    if (!event.location || !filter.locations.has(event.location.id)) return false;
  }
  return true;
}

export interface ActiveFilterTag {
  key: string;
  label: string;
  remove: () => void;
}

export function buildActiveFilterTags(
  filter: FilterState,
  onChange: (f: FilterState) => void,
  options: FilterOptions,
  modeLabel: (mode: string) => string,
  eventTypeLabel: (type: string) => string,
): ActiveFilterTag[] {
  const tags: ActiveFilterTag[] = [];
  const removeFrom = (key: keyof FilterState, value: string) => {
    const next = { ...filter, [key]: new Set(filter[key]) };
    next[key].delete(value);
    onChange(next);
  };
  filter.eventTypes.forEach((v) =>
    tags.push({
      key: `et-${v}`,
      label: eventTypeLabel(v),
      remove: () => removeFrom('eventTypes', v),
    }),
  );
  filter.narrativeModes.forEach((v) =>
    tags.push({
      key: `nm-${v}`,
      label: modeLabel(v),
      remove: () => removeFrom('narrativeModes', v),
    }),
  );
  filter.characters.forEach((id) => {
    const name = options.characters.find((c) => c.id === id)?.name ?? id;
    tags.push({ key: `ch-${id}`, label: name, remove: () => removeFrom('characters', id) });
  });
  filter.locations.forEach((id) => {
    const name = options.locations.find((l) => l.id === id)?.name ?? id;
    tags.push({ key: `lo-${id}`, label: name, remove: () => removeFrom('locations', id) });
  });
  filter.importance.forEach((v) =>
    tags.push({ key: `im-${v}`, label: v, remove: () => removeFrom('importance', v) }),
  );
  return tags;
}

/** Build the filter's option lists from the events actually present. */
export function buildFilterOptions(events: TimelineEvent[]): FilterOptions {
  const eventTypes = new Set<string>();
  const narrativeModes = new Set<string>();
  const characters = new Map<string, string>();
  const locations = new Map<string, string>();

  for (const e of events) {
    eventTypes.add(e.eventType);
    narrativeModes.add(e.narrativeMode);
    for (const p of e.participants) {
      if (p.type === 'character') characters.set(p.id, p.name);
    }
    if (e.location) locations.set(e.location.id, e.location.name);
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    eventTypes: [...eventTypes].sort(),
    narrativeModes: [...narrativeModes].sort(),
    characters: [...characters].map(([id, name]) => ({ id, name })).sort(byName),
    // `location` is empty in real data today; the section hides itself when so.
    locations: [...locations].map(([id, name]) => ({ id, name })).sort(byName),
  };
}
