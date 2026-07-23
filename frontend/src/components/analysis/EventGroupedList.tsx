import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnalysisItem, AnalysisListResponse, UnanalyzedEntity } from '@/api/types';
import { EventAnalyzedItem, EventUnanalyzedItem } from './EventListItems';

type ImportanceKey = 'KERNEL' | 'SATELLITE' | 'UNDETERMINED';
type ModeKey = 'flashback' | 'flashforward' | 'parallel';
type GroupBy = 'chapter' | 'importance';

interface EventGroupedListProps {
  evtData: AnalysisListResponse;
  searchQuery: string;
  selectedEntityId: string | null;
  onSelect: (id: string) => void;
  onGenerate: (id: string) => void;
  generatingId: string | null;
  justDoneIds: Set<string>;
  checkMode: boolean;
  checked: Set<string>;
  onToggleChecked: (id: string) => void;
}

type Row =
  | { kind: 'analyzed'; id: string; item: AnalysisItem }
  | { kind: 'unanalyzed'; id: string; item: UnanalyzedEntity };

const IMPORTANCE_BUCKETS: ImportanceKey[] = ['KERNEL', 'SATELLITE', 'UNDETERMINED'];
// The canvas offers only 核心 K / 衛星 S as filters. "Undetermined" is still a
// grouping bucket — it just isn't a filter chip.
const IMPORTANCE_CHIPS: ImportanceKey[] = ['KERNEL', 'SATELLITE'];
const MODE_CHIPS: ModeKey[] = ['flashback', 'flashforward', 'parallel'];

const IMPORTANCE_CHIP_KEY: Partial<Record<ImportanceKey, string>> = {
  KERNEL: 'event.list.filterKernel',
  SATELLITE: 'event.list.filterSatellite',
};

const IMPORTANCE_GROUP_KEY: Record<ImportanceKey, string> = {
  KERNEL: 'event.importance.kernel',
  SATELLITE: 'event.importance.satellite',
  UNDETERMINED: 'event.overview.undetermined',
};

function rowTitle(row: Row): string {
  return row.kind === 'analyzed' ? row.item.title : row.item.name;
}

function rowChapter(row: Row): number | null {
  return row.item.chapter ?? null;
}

function rowImportance(row: Row): ImportanceKey {
  const raw = row.item.importance;
  if (raw === 'KERNEL') return 'KERNEL';
  if (raw === 'SATELLITE') return 'SATELLITE';
  return 'UNDETERMINED';
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function EventGroupedList({
  evtData,
  searchQuery,
  selectedEntityId,
  onSelect,
  onGenerate,
  generatingId,
  justDoneIds,
  checkMode,
  checked,
  onToggleChecked,
}: Readonly<EventGroupedListProps>) {
  const { t } = useTranslation('analysis');
  const [impFilter, setImpFilter] = useState<Set<ImportanceKey>>(new Set());
  const [modeFilter, setModeFilter] = useState<Set<ModeKey>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>('chapter');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const all: Row[] = [
      ...evtData.analyzed.map<Row>((item) => ({ kind: 'analyzed', id: item.entityId, item })),
      ...evtData.unanalyzed.map<Row>((item) => ({ kind: 'unanalyzed', id: item.id, item })),
    ];

    const q = searchQuery.trim().toLowerCase();
    const rows = all.filter((row) => {
      if (q && !rowTitle(row).toLowerCase().includes(q)) return false;
      if (impFilter.size && !impFilter.has(rowImportance(row))) return false;
      if (modeFilter.size && !modeFilter.has(row.item.narrativeMode as ModeKey)) return false;
      return true;
    });

    const buckets = new Map<string, { label: string; rows: Row[] }>();
    if (groupBy === 'importance') {
      for (const key of IMPORTANCE_BUCKETS) {
        const inBucket = rows.filter((r) => rowImportance(r) === key);
        if (inBucket.length) {
          buckets.set(`imp-${key}`, {
            label: t(IMPORTANCE_GROUP_KEY[key]),
            rows: inBucket.sort((a, b) => (rowChapter(a) ?? 0) - (rowChapter(b) ?? 0)),
          });
        }
      }
    } else {
      const chapters = [
        ...new Set(rows.map(rowChapter).filter((c): c is number => c !== null)),
      ].sort((a, b) => a - b);
      for (const ch of chapters) {
        buckets.set(`ch-${ch}`, {
          label: t('event.list.chapterGroup', { n: ch }),
          rows: rows.filter((r) => rowChapter(r) === ch),
        });
      }
      const undated = rows.filter((r) => rowChapter(r) === null);
      if (undated.length) {
        buckets.set('ch-none', { label: t('event.list.noChapterGroup'), rows: undated });
      }
    }

    return [...buckets.entries()].map(([key, g]) => ({
      key,
      label: g.label,
      rows: g.rows,
      analyzedCount: g.rows.filter((r) => r.kind === 'analyzed').length,
    }));
  }, [evtData, searchQuery, impFilter, modeFilter, groupBy, t]);

  const hasFilters = impFilter.size > 0 || modeFilter.size > 0;

  const chipClass = (active: boolean) => 'ea-chip' + (active ? ' active' : '');

  return (
    <>
      <div className="ea-list-controls">
        <div className="ea-chip-row">
          {IMPORTANCE_CHIPS.map((key) => (
            <button
              key={key}
              type="button"
              className={chipClass(impFilter.has(key))}
              onClick={() => setImpFilter((s) => toggle(s, key))}
            >
              {t(IMPORTANCE_CHIP_KEY[key] as string)}
            </button>
          ))}
          {MODE_CHIPS.map((key) => (
            <button
              key={key}
              type="button"
              className={chipClass(modeFilter.has(key))}
              onClick={() => setModeFilter((s) => toggle(s, key))}
            >
              {t(`event.narrative.${key}`)}
            </button>
          ))}
        </div>
        <div className="ea-group-row">
          <span className="ea-group-label">{t('event.list.groupLabel')}</span>
          <div className="ea-seg">
            <button
              type="button"
              className={'ea-seg-btn' + (groupBy === 'chapter' ? ' active' : '')}
              onClick={() => setGroupBy('chapter')}
            >
              {t('event.list.groupByChapter')}
            </button>
            <button
              type="button"
              className={'ea-seg-btn' + (groupBy === 'importance' ? ' active' : '')}
              onClick={() => setGroupBy('importance')}
            >
              {t('event.list.groupByImportance')}
            </button>
          </div>
        </div>
      </div>

      <div className="ea-list">
        {groups.map((g) => {
          const open = !collapsed.has(g.key);
          return (
            <div key={g.key} className="ea-list-group">
              <button
                type="button"
                className="ea-list-group-head"
                onClick={() => setCollapsed((s) => toggle(s, g.key))}
              >
                <ChevronRight size={12} className={'ea-caret' + (open ? ' open' : '')} />
                <span className="ea-group-name">{g.label}</span>
                <span className="count">
                  {t('event.list.groupMeta', { total: g.rows.length, analyzed: g.analyzedCount })}
                </span>
              </button>
              {open &&
                g.rows.map((row) =>
                  row.kind === 'analyzed' ? (
                    <EventAnalyzedItem
                      key={row.id}
                      item={row.item}
                      isSelected={selectedEntityId === row.id}
                      onSelect={() => onSelect(row.id)}
                      justDone={justDoneIds.has(row.id)}
                      showImportance
                      showNarrative
                    />
                  ) : (
                    <div key={row.id} className="ea-row-wrap">
                      {checkMode && (
                        <input
                          type="checkbox"
                          className="ea-row-check"
                          checked={checked.has(row.id)}
                          aria-label={rowTitle(row)}
                          onChange={() => onToggleChecked(row.id)}
                        />
                      )}
                      <EventUnanalyzedItem
                        item={row.item}
                        isSelected={selectedEntityId === row.id}
                        onSelect={() => onSelect(row.id)}
                        onGenerate={() => onGenerate(row.id)}
                        isGenerating={generatingId === row.id}
                        showImportance
                        showNarrative
                      />
                    </div>
                  ),
                )}
            </div>
          );
        })}


        {groups.length === 0 && (
          <div className="ea-list-empty">
            <p>{t('event.list.noMatch')}</p>
            {hasFilters && (
              <button
                type="button"
                className="ea-btn"
                onClick={() => {
                  setImpFilter(new Set());
                  setModeFilter(new Set());
                }}
              >
                {t('event.list.clearFilters')}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
