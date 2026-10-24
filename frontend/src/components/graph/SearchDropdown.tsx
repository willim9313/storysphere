import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityType, GraphNode } from '@/api/types';

export interface SearchChapter {
  id: string;
  title: string;
  order: number;
  topEntities?: { id: string; name: string; type: EntityType }[];
}

interface SearchDropdownProps {
  readonly query: string;
  readonly entities: GraphNode[];
  readonly chapters: SearchChapter[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelectEntity: (id: string) => void;
  readonly onSelectChapter: (chapterId: string) => void;
  /** Reports the id of the highlighted option (null when none) for aria-activedescendant. */
  readonly onActiveOptionChange?: (id: string | null) => void;
}

export const SEARCH_LISTBOX_ID = 'kg-search-listbox';
const optionId = (section: SectionName, id: string) => `kg-search-opt-${section}-${id}`;

type SectionName = 'entity' | 'chapter' | 'paragraph';

interface FlatResult {
  section: SectionName;
  id: string;
}

const MAX_PER_SECTION = 8;

// Every type gets its own --graph-* swatch; organisation / object / other used
// to fall through to the character colour, mislabelling them in the results.
const DOT_KEY: Record<EntityType, string> = {
  character: 'char',
  location: 'loc',
  organization: 'org',
  object: 'obj',
  concept: 'con',
  event: 'evt',
  other: 'other',
};
function dotKeyFor(type: EntityType): string {
  return DOT_KEY[type] ?? 'other';
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="kg-search-hit">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchDropdown({
  query,
  entities,
  chapters,
  open,
  onClose,
  onSelectEntity,
  onSelectChapter,
  onActiveOptionChange,
}: SearchDropdownProps) {
  const { t } = useTranslation('graph');
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredEntities = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return entities.filter((e) => e.name.toLowerCase().includes(q)).slice(0, MAX_PER_SECTION);
  }, [query, entities]);

  const filteredChapters = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return chapters
      .filter((c) => c.title.toLowerCase().includes(q))
      .slice(0, MAX_PER_SECTION);
  }, [query, chapters]);

  const flat = useMemo<FlatResult[]>(() => {
    return [
      ...filteredEntities.map((e) => ({ section: 'entity' as const, id: e.id })),
      ...filteredChapters.map((c) => ({ section: 'chapter' as const, id: c.id })),
    ];
  }, [filteredEntities, filteredChapters]);

  const [prevKey, setPrevKey] = useState(`${query}|${open}`);
  const currentKey = `${query}|${open}`;
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setActiveIdx(0);
  }

  const activeItem = flat.length > 0 ? flat[Math.min(activeIdx, flat.length - 1)] : undefined;
  const activeId = open && query && activeItem ? optionId(activeItem.section, activeItem.id) : null;

  useEffect(() => {
    onActiveOptionChange?.(activeId);
  }, [activeId, onActiveOptionChange]);

  // Keys act only while focus is in the search input; focus elsewhere
  // (a button, the canvas) must not trigger Enter/Arrow handling.
  useEffect(() => {
    if (!open) return;
    const inSearchInput = (t: EventTarget | null) =>
      t instanceof HTMLInputElement && t.closest('.kg-search') !== null;
    const handler = (e: KeyboardEvent) => {
      if (!inSearchInput(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (flat.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % flat.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + flat.length) % flat.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[activeIdx];
        if (!item) return;
        if (item.section === 'entity') onSelectEntity(item.id);
        else if (item.section === 'chapter') onSelectChapter(item.id);
      }
    };
    // Click or focus landing outside the search box closes the dropdown.
    // Option rows preventDefault on mousedown so the input never blurs first.
    const outside = (e: Event) => {
      const el = e.target;
      if (el instanceof Element && el.closest('.kg-search')) return;
      onClose();
    };
    window.addEventListener('keydown', handler);
    document.addEventListener('mousedown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      window.removeEventListener('keydown', handler);
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open, flat, activeIdx, onClose, onSelectEntity, onSelectChapter]);

  if (!open || !query) return null;

  return (
    <div
      ref={listRef}
      className="kg-search-pop"
      id={SEARCH_LISTBOX_ID}
      role="listbox"
      aria-label={t('searchA11y.listLabel')}
    >
      <div className="kg-search-scroll">
        <Group
          header={t('v1.search.section.entity')}
          count={filteredEntities.length}
          isLast={false}
        >
          {filteredEntities.length === 0 ? (
            <Empty>{t('v1.search.noResults')}</Empty>
          ) : (
            filteredEntities.map((e, i) => {
              const flatIdx = i;
              const active = activeIdx === flatIdx;
              return (
                <Row
                  key={e.id}
                  id={optionId('entity', e.id)}
                  active={active}
                  onClick={() => onSelectEntity(e.id)}
                  left={
                    <span
                      className="kg-search-dot"
                      style={{
                        backgroundColor: `var(--entity-${dotKeyFor(e.type as EntityType)}-dot, var(--accent))`,
                      }}
                    />
                  }
                  name={highlight(e.name, query)}
                  meta={t('v1.search.entityMeta', { count: e.chunkCount })}
                />
              );
            })
          )}
        </Group>

        <Group
          header={t('v1.search.section.chapter')}
          count={filteredChapters.length}
          isLast={false}
        >
          {filteredChapters.length === 0 ? (
            <Empty>{t('v1.search.noResults')}</Empty>
          ) : (
            filteredChapters.map((c, i) => {
              const flatIdx = filteredEntities.length + i;
              const active = activeIdx === flatIdx;
              return (
                <Row
                  key={c.id}
                  id={optionId('chapter', c.id)}
                  active={active}
                  onClick={() => onSelectChapter(c.id)}
                  left={
                    <span className="kg-search-order">{c.order}</span>
                  }
                  name={highlight(c.title, query)}
                  meta={t('v1.search.chapterMeta', { order: c.order })}
                />
              );
            })
          )}
        </Group>

        <Group
          header={t('v1.search.section.paragraph')}
          count={0}
          isLast
        >
          <Empty>{t('v1.search.paragraphComingSoon')}</Empty>
        </Group>
      </div>

      {/* Keyboard hint footer */}
      <div className="kg-search-foot">
        <span className="kg-search-hint">
          <Kbd>↑↓</Kbd>
          {t('v1.search.kbd.navigate')}
        </span>
        <span className="kg-search-hint">
          <Kbd>↵</Kbd>
          {t('v1.search.kbd.select')}
        </span>
        <span className="kg-search-hint">
          <Kbd>esc</Kbd>
          {t('v1.search.kbd.close')}
        </span>
        <span className="kg-search-foot-end">{t('v1.search.kbd.advanced')}</span>
      </div>
    </div>
  );
}

interface GroupProps {
  readonly header: string;
  readonly count: number;
  readonly isLast: boolean;
  readonly children: React.ReactNode;
}

function Group({ header, count, isLast, children }: GroupProps) {
  return (
    <div role="group" aria-label={header} className={`kg-search-group${isLast ? ' is-last' : ''}`}>
      <div className="kg-search-group-head">
        <span>{header}</span>
        {count > 0 && <span className="kg-search-count">{count}</span>}
      </div>
      {children}
    </div>
  );
}

interface RowProps {
  readonly id: string;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly left?: React.ReactNode;
  readonly name: React.ReactNode;
  readonly meta?: string;
}

function Row({ id, active, onClick, left, name, meta }: RowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`kg-search-row${active ? ' is-active' : ''}`}
    >
      {left}
      <span className="kg-search-name">{name}</span>
      {meta && <span className="kg-search-meta">{meta}</span>}
    </div>
  );
}

function Empty({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="kg-search-empty">{children}</div>
  );
}

function Kbd({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="kg-search-kbd">{children}</span>
  );
}
