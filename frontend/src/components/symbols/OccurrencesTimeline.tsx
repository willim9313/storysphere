import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink, Telescope } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { SymbolTimelineEntry } from '@/api/symbols';

import { chapterSegment, type ChapterAxis, type ChapterSegment } from './chapterAxis';
import { segmentLabel } from './symbolPhrases';

interface Props {
  timeline: SymbolTimelineEntry[];
  loading: boolean;
  term: string;
  aliases: string[];
  bookId: string;
  /** Decides which segment each occurrence's chapter belongs to. */
  axis: ChapterAxis;
}

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(s: string): string {
  return s.replace(ESCAPE_REGEX, String.raw`\$&`);
}

function highlight(text: string, term: string, aliases: string[]): ReactNode {
  const all = [term, ...aliases].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!text || all.length === 0) return text;
  const pattern = new RegExp(`(${all.map(escapeRegExp).join('|')})`, 'g');
  const parts = text.split(pattern);
  const allSet = new Set(all);
  return parts.map((p, i) => {
    const key = `${i}-${p}`;
    if (allSet.has(p)) {
      return (
        <mark key={key} className="sym-mark">
          {p}
        </mark>
      );
    }
    return <span key={key}>{p}</span>;
  });
}

interface ChapterGroup {
  chapter: number;
  segment: ChapterSegment;
  items: SymbolTimelineEntry[];
}

/**
 * Group by chapter, then split the groups by segment.
 *
 * The list used to be one flat run of 「第 N 章」 headings, which on 海 opened with
 * 「第 -1 章」 — the colophon, printed as if it were a chapter of the novel and
 * carrying a jump button to a chapter the reader does not have.
 */
function groupBySegment(timeline: SymbolTimelineEntry[], axis: ChapterAxis) {
  const byChapter = new Map<number, SymbolTimelineEntry[]>();
  for (const entry of timeline) {
    const list = byChapter.get(entry.chapter_number) ?? [];
    list.push(entry);
    byChapter.set(entry.chapter_number, list);
  }

  const groups: ChapterGroup[] = [...byChapter.entries()]
    .map(([chapter, items]) => ({
      chapter,
      segment: chapterSegment(chapter, axis),
      items,
    }))
    .sort((a, b) => a.chapter - b.chapter);

  return {
    // Front matter is held back rather than led with: it is the noise, and it is
    // where the lowest chapter numbers sort to.
    front: groups.filter((g) => g.segment === 'front'),
    story: groups.filter((g) => g.segment !== 'front'),
  };
}

function OccurrenceRow({
  item,
  ordinal,
  term,
  aliases,
  jumpable,
  onJump,
  t,
}: Readonly<{
  item: SymbolTimelineEntry;
  /**
   * Which occurrence this is within its chapter, 1-based, or null when it is the
   * only one there.
   *
   * `item.position` is the 0-based index the query orders by, so every row in a
   * single-occurrence chapter printed 「#0」 — thirteen times down the card on 海,
   * saying nothing. Numbering only where there is something to distinguish.
   */
  ordinal: number | null;
  term: string;
  aliases: string[];
  jumpable: boolean;
  onJump: () => void;
  t: TFunction<'analysis'>;
}>) {
  return (
    <div className={'sym-occ-row' + (jumpable ? '' : ' is-outside')}>
      <span className="sym-occ-pos">{ordinal === null ? '' : `#${ordinal}`}</span>
      <div className="sym-occ-text">「{highlight(item.context_window, term, aliases)}」</div>
      <div className="sym-occ-side">
        {item.co_occurring_terms.slice(0, 3).map((tag) => (
          <span key={tag} className="sym-occ-tag">
            {tag}
          </span>
        ))}
        {jumpable ? (
          <button
            type="button"
            className="sym-occ-jump"
            title={t('symbol.interpretation.occurrenceJumpTitle')}
            onClick={onJump}
          >
            <ExternalLink size={11} />
          </button>
        ) : (
          // Not a disabled button: there is nothing to enable. The reader lists
          // body chapters only, so this paragraph has no page to open, and a
          // greyed control invites clicking to find out why.
          <span className="sym-occ-nojump" title={t('symbol.occ.noJumpTitle')}>
            {t('symbol.occ.noJump')}
          </span>
        )}
      </div>
    </div>
  );
}

export function OccurrencesTimeline({
  timeline,
  loading,
  term,
  aliases,
  bookId,
  axis,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  const [showFront, setShowFront] = useState(false);

  const { front, story } = useMemo(() => groupBySegment(timeline, axis), [timeline, axis]);

  // ReaderPage is mounted at the index route /books/:bookId (not /read), see
  // router.tsx:86. It loads chunks one chapter at a time, so we pass both
  // paragraphId (= Chunk.id on the wire) and chapterNumber so it can pick the
  // right chapter before scrolling to the paragraph.
  const jump = (item: SymbolTimelineEntry) =>
    navigate(`/books/${bookId}`, {
      state: { paragraphId: item.paragraph_id, chapterNumber: item.chapter_number },
    });

  const frontCount = front.reduce((sum, g) => sum + g.items.length, 0);
  const bodyChapters = story.filter((g) => g.segment === 'body').length;

  let body: ReactNode;
  if (loading) {
    body = (
      <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  } else if (timeline.length === 0) {
    body = (
      <p className="sym-card-empty" style={{ padding: '12px 14px' }}>
        {t('symbol.noOccurrences')}
      </p>
    );
  } else {
    body = (
      <div className="sym-occ">
        {story.map((group) => {
          const outside = group.segment !== 'body';
          const slot = axis.slots.find((s) => s.chapter === group.chapter);
          return (
            <div key={group.chapter} className="sym-occ-group">
              <div className={'sym-occ-ch' + (outside ? ' is-outside' : '')}>
                <span className="sym-occ-chnum">
                  {outside && slot
                    ? t('symbol.occ.outsideHeading', {
                        label: segmentLabel(t, slot),
                        chapter: group.chapter,
                      })
                    : t('symbol.chapterN', { n: group.chapter })}
                </span>
                <span className="sym-occ-chcount">
                  {t('symbol.chapterOccurrences', { count: group.items.length })}
                </span>
                {outside && (
                  // Kept as evidence — the afterword counts towards trust — but
                  // stated as outside the story, since the shape and first
                  // appearance above deliberately exclude it.
                  <span className="sym-occ-badge">{t('symbol.occ.outsideBadge')}</span>
                )}
                <span className="sym-occ-chline" />
              </div>
              {group.items.map((item, i) => (
                <OccurrenceRow
                  key={item.occurrence_id}
                  item={item}
                  ordinal={group.items.length > 1 ? i + 1 : null}
                  term={term}
                  aliases={aliases}
                  jumpable={!outside}
                  onJump={() => jump(item)}
                  t={t}
                />
              ))}
            </div>
          );
        })}

        {frontCount > 0 && (
          <div className="sym-occ-front">
            <button
              type="button"
              className="sym-occ-front-toggle"
              onClick={() => setShowFront((v) => !v)}
              aria-expanded={showFront}
            >
              {showFront ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showFront
                ? t('symbol.occ.frontHide', { count: frontCount })
                : t('symbol.occ.frontShow', { count: frontCount })}
            </button>
            <p className="sym-occ-front-desc">{t('symbol.occ.frontDesc')}</p>
            {showFront &&
              front.flatMap((group) =>
                group.items.map((item, i) => (
                  <OccurrenceRow
                    key={item.occurrence_id}
                    item={item}
                    ordinal={group.items.length > 1 ? i + 1 : null}
                    term={term}
                    aliases={aliases}
                    jumpable={false}
                    onJump={() => undefined}
                    t={t}
                  />
                )),
              )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="sym-card">
      <div className="sym-card-head">
        <Telescope size={13} style={{ color: 'var(--accent)' }} />
        <span className="sym-card-title">{t('symbol.occurrences')}</span>
        <span className="sym-card-meta">
          {/* The front-matter clause is dropped at zero rather than reading
              「前置頁 0 筆另計」, which is a template showing through and not a
              fact about the symbol. */}
          {frontCount > 0
            ? t('symbol.occ.meta', {
                count: timeline.length,
                chapters: bodyChapters,
                front: frontCount,
              })
            : t('symbol.occ.metaClean', {
                count: timeline.length,
                chapters: bodyChapters,
              })}
        </span>
      </div>
      {body}
    </section>
  );
}
