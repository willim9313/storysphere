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
  query: string;
  entities: GraphNode[];
  chapters: SearchChapter[];
  open: boolean;
  onClose: () => void;
  onSelectEntity: (id: string) => void;
  onSelectChapter: (chapterId: string) => void;
}

type Section = 'entity' | 'chapter' | 'paragraph';

interface FlatResult {
  section: Section;
  id: string;
  label: string;
  meta?: string;
  type?: EntityType;
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
      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
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
      ...filteredEntities.map((e) => ({
        section: 'entity' as const,
        id: e.id,
        label: e.name,
        meta: t('v1.search.entityMeta', { count: e.chunkCount }),
        type: e.type as EntityType,
      })),
      ...filteredChapters.map((c) => ({
        section: 'chapter' as const,
        id: c.id,
        label: c.title,
        meta: t('v1.search.chapterMeta', { order: c.order }),
      })),
    ];
  }, [filteredEntities, filteredChapters, t]);

  // Reset active index when query / open state changes (React "compute during render" pattern)
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
      className="absolute z-20"
      style={{
        top: 'calc(4rem + 32px + 8px)',
        left: 'calc(4rem - 1rem)',
        width: 360,
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        maxHeight: '60vh',
        overflowY: 'auto',
      }}
      role="listbox"
    >
      <Section header={t('v1.search.section.entity')}>
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
                label={highlight(e.name, query)}
                meta={t('v1.search.entityMeta', { count: e.chunkCount })}
              />
            );
          })
        )}
      </Section>

      <Section header={t('v1.search.section.chapter')}>
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
                label={highlight(c.title, query)}
                meta={t('v1.search.chapterMeta', { order: c.order })}
              />
            );
          })
        )}
      </Section>

      <Section header={t('v1.search.section.paragraph')}>
        <Empty>{t('v1.search.paragraphComingSoon')}</Empty>
      </Section>
    </div>
  );
}

function Section({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <div
        className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase"
        style={{ color: 'var(--fg-muted)', letterSpacing: '0.06em' }}
      >
        {header}
      </div>
      {children}
    </div>
  );
}

function Row({
  active,
  onClick,
  left,
  label,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  left?: React.ReactNode;
  label: React.ReactNode;
  meta?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left"
      style={{
        backgroundColor: active ? 'var(--bg-secondary)' : 'transparent',
        color: 'var(--fg-primary)',
      }}
    >
      {left}
      <span className="flex-1 truncate">{label}</span>
      {meta && (
        <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>
          {meta}
        </span>
      )}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
      {children}
    </div>
  );
}
