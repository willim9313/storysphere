import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { entityStyle, typeStyle, type SymbolTypeStyle } from './tokens';
import type { SymbolSignals } from './symbolSignals';

/** Entity types that describe where a symbol appears rather than who is there. */
const SCENE_TYPES = new Set(['location', 'concept', 'object', 'organization']);

interface Row {
  key: string;
  name: string;
  count: number;
  /** Secondary text: a share, or what kind of thing this is. */
  meta: string;
  style: SymbolTypeStyle;
  /** The one the behaviour summary named, so the two cards agree on sight. */
  lead?: boolean;
  onOpen?: () => void;
}

interface Group {
  key: 'characters' | 'scenes' | 'allies';
  rows: Row[];
}

interface Props {
  bookId: string;
  signals: SymbolSignals;
  /** Selects another symbol in this page rather than navigating away. */
  onSelectCo: (id: string) => void;
}

/**
 * Who and what a symbol shares paragraphs with, kept in three separate columns.
 *
 * One list called 「共現角色」 used to hold all of it, and on real data most of it
 * was not characters: of 海's 19 co-occurring entities, most are locations and
 * concepts. Merging them invited the reading that a symbol is "about" a place the
 * same way it is about a person, and only the character column feeds ranking.
 *
 * Everything here comes from the aggregate the page already fetched. This card
 * used to cost two more requests — `#15c` for the allies and `#15d` for the entity
 * counts — both of which the overview now carries per symbol.
 */
export function CoOccurrencePanel({ bookId, signals, onSelectCo }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();

  const groups = useMemo<Group[]>(() => {
    const entities = signals.item.co_occurring_entities ?? [];
    const bodyOcc = signals.distribution.body;

    /*
     * Characters are ordered by attachment score, not by raw count.
     *
     * Sorted by count, the column's first row was 伊內絲 (6 of 6 body occurrences)
     * while the behaviour summary above named 巴爾塔薩神父 — who appears in only 2
     * of the book's 40 body paragraphs, so sharing 2 of them with this symbol is
     * far less explicable by chance. Both statements were true and the page looked
     * broken. The score is the one the ranking uses, so the column now leads with
     * the same name, and the count stays on every row.
     */
    const leadId = signals.attachment?.entity.id;
    const characters: Row[] = entities
      .filter((e) => e.entity_type === 'character')
      .map((e) => ({
        key: e.id,
        name: e.name,
        count: e.count,
        // Share of the symbol's body occurrences, not of its total: the total is
        // the figure front matter inflates.
        meta:
          bodyOcc > 0
            ? t('symbol.co.shareOfBody', {
                pct: Math.round((e.body_count / bodyOcc) * 100),
              })
            : t('symbol.co.noBodyShare'),
        style: entityStyle(e.entity_type),
        lead: e.id === leadId,
        onOpen: () =>
          navigate(`/books/${bookId}/characters`, { state: { selectId: e.id } }),
      }))
      .sort((a, b) => Number(b.lead ?? false) - Number(a.lead ?? false) || b.count - a.count);

    const scenes: Row[] = entities
      .filter((e) => SCENE_TYPES.has(e.entity_type))
      .map((e) => ({
        key: e.id,
        name: e.name,
        count: e.count,
        meta: t(`symbol.co.entityType.${e.entity_type}`),
        style: entityStyle(e.entity_type),
        // Not the character page — a location has no character detail. The graph
        // focuses any entity type by id.
        onOpen: () => navigate(`/books/${bookId}/graph?entity=${e.id}`),
      }));

    const allies: Row[] = (signals.item.co_occurring_imagery ?? []).map((a) => ({
      key: a.imagery_id,
      name: a.term,
      count: a.co_occurrence_count,
      meta: t(`symbol.types.${a.imagery_type}`, { defaultValue: a.imagery_type }),
      style: typeStyle(a.imagery_type),
      onOpen: () => onSelectCo(a.imagery_id),
    }));

    return [
      { key: 'characters', rows: characters },
      { key: 'scenes', rows: scenes },
      { key: 'allies', rows: allies },
    ];
  }, [signals, bookId, navigate, onSelectCo, t]);

  const entityCount = (signals.item.co_occurring_entities ?? []).length;

  return (
    <section className="sym-card">
      <div className="sym-card-head">
        <Link2 size={13} style={{ color: 'var(--accent)' }} />
        <span className="sym-card-title">{t('symbol.co.title')}</span>
        <span className="sym-card-meta">
          {t('symbol.co.meta', { entities: entityCount, events: signals.eventCount })}
        </span>
      </div>
      <div className="sym-card-body">
        <p className="sym-co-note">{selfFilterNote(t, signals)}</p>

        <div className="sym-co-cols">
          {groups.map((group) => (
            <div key={group.key} className="sym-co-col">
              <div className="sym-co-col-title">{t(`symbol.co.${group.key}.title`)}</div>
              <div className="sym-co-col-sub">{t(`symbol.co.${group.key}.sub`)}</div>
              {group.rows.length === 0 ? (
                <p className="sym-co-empty">{t(`symbol.co.${group.key}.empty`)}</p>
              ) : (
                <div className="sym-co-rows">
                  {group.rows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      className={'sym-co-row' + (row.lead ? ' is-lead' : '')}
                      style={{ background: row.style.bg, color: row.style.fg }}
                      onClick={row.onOpen}
                      title={row.lead ? t('symbol.co.leadHint') : undefined}
                    >
                      <span className="sym-co-dot" style={{ background: row.style.dot }} />
                      <span className="sym-co-name">{row.name}</span>
                      <span className="sym-co-meta">{row.meta}</span>
                      <span className="sym-co-count">{row.count}</span>
                      <ExternalLink size={10} aria-hidden="true" className="sym-co-go" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Why the strongest co-occurrence is missing from the list.
 *
 * A symbol always co-occurs with the KG entity of its own name, and that hit
 * outranks every real one — 海's top co-occurrence was the location 海, 12 times.
 * The backend removes it and reports the count so this can say so; dropping it
 * silently leaves a reader comparing the list against a graph that disagrees.
 */
function selfFilterNote(t: TFunction<'analysis'>, signals: SymbolSignals): string {
  const self = signals.item.self_match_count;
  if (self != null && self > 0) {
    return t('symbol.co.selfFiltered', { term: signals.term, count: self });
  }
  return t('symbol.co.selfNone');
}
