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
}

type SectionName = 'entity' | 'chapter' | 'paragraph';

interface FlatResult {
  section: SectionName;
  id: string;
}

const MAX_PER_SECTION = 8;

function dotKeyFor(type: EntityType): string {
  if (type === 'concept') return 'con';
  if (type === 'event') return 'evt';
  if (type === 'location') return 'loc';
  if (type === 'character') return 'char';
  return 'char';
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span
        style={{
          backgroundColor: 'var(--color-warning-bg, #fff3c4)',
          color: 'var(--fg-primary)',
          padding: '0 2px',
          borderRadius: 2,
          fontWeight: 600,
        }}
      >
        {text.slice(idx, idx + query.length)}
      </span>
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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
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
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, flat, activeIdx, onClose, onSelectEntity, onSelectChapter]);

  if (!open || !query) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-20 flex flex-col"
      style={{
        // Anchored just under the toolbar (top:12 + ~32 toolbar height + 12 gap)
        top: 56,
        left: 12,
        width: 460,
        maxHeight: 'calc(100% - 80px)',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg, var(--shadow-md))',
        overflow: 'hidden',
      }}
      role="listbox"
    >
      <div className="flex-1 overflow-y-auto">
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
                  active={active}
                  onClick={() => onSelectEntity(e.id)}
                  left={
                    <span
                      className="inline-block rounded-full"
                      style={{
                        width: 8,
                        height: 8,
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
                  active={active}
                  onClick={() => onSelectChapter(c.id)}
                  left={
                    <span
                      className="inline-flex items-center justify-center rounded-full tabular-nums"
                      style={{
                        width: 22,
                        height: 22,
                        backgroundColor: 'var(--bg-tertiary)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 'var(--font-size-2xs)',
                        color: 'var(--fg-secondary)',
                      }}
                    >
                      {c.order}
                    </span>
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
      <div
        className="flex items-center"
        style={{
          gap: 12,
          padding: '6px 14px',
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          fontSize: 'var(--font-size-2xs)',
          color: 'var(--fg-muted)',
          flexShrink: 0,
        }}
      >
        <span className="inline-flex items-center" style={{ gap: 4 }}>
          <Kbd>↑↓</Kbd>
          {t('v1.search.kbd.navigate')}
        </span>
        <span className="inline-flex items-center" style={{ gap: 4 }}>
          <Kbd>↵</Kbd>
          {t('v1.search.kbd.select')}
        </span>
        <span className="inline-flex items-center" style={{ gap: 4 }}>
          <Kbd>esc</Kbd>
          {t('v1.search.kbd.close')}
        </span>
        <span style={{ marginLeft: 'auto' }}>{t('v1.search.kbd.advanced')}</span>
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
    <div style={{ padding: '6px 0', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
      <div
        className="flex items-center justify-between"
        style={{
          padding: '4px 14px',
          fontSize: 'var(--font-size-2xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--fg-muted)',
        }}
      >
        <span>{header}</span>
        {count > 0 && (
          <span
            className="tabular-nums"
            style={{ fontFamily: 'var(--font-mono, monospace)' }}
          >
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface RowProps {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly left?: React.ReactNode;
  readonly name: React.ReactNode;
  readonly meta?: string;
}

function Row({ active, onClick, left, name, meta }: RowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center text-left"
      style={{
        gap: 8,
        padding: '6px 14px',
        fontSize: 'var(--font-size-xs)',
        backgroundColor: active ? 'var(--bg-tertiary)' : 'transparent',
        color: 'var(--fg-primary)',
        border: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {left}
      <span
        className="flex-1 truncate"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {name}
      </span>
      {meta && (
        <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
          {meta}
        </span>
      )}
    </button>
  );
}

function Empty({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      style={{ padding: '6px 14px', fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)' }}
    >
      {children}
    </div>
  );
}

function Kbd({ children }: { readonly children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 600,
        fontSize: 'var(--font-size-2xs)',
        padding: '0 4px',
        borderRadius: 3,
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--fg-secondary)',
      }}
    >
      {children}
    </span>
  );
}
