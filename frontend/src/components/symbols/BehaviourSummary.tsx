import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Gauge } from 'lucide-react';

import { claimSentence, shapeLabel } from './symbolPhrases';
import { normalise, type SymbolAnalysis, type SymbolSignals } from './symbolSignals';

/** Below this, a ranking figure rests mostly on front matter and is marked as such. */
const TRUST_FLOOR = 0.8;

interface Cell {
  key: string;
  label: string;
  value: string;
  /** Bar fill, 0–1, on the same scale the load formula uses. */
  fill: number;
  /** What the figure is measured against, or why there is no figure. */
  note: string;
  warn?: boolean;
}

/**
 * The six signals, each with what it is measured against.
 *
 * Every note names a denominator. A bar on its own says a symbol scored two
 * thirds of something without saying two thirds of what, and for three of these
 * six the answer is "of the strongest value in this book" — which changes between
 * books and is the only reason the bars are comparable at all.
 */
function cells(
  t: TFunction<'analysis'>,
  s: SymbolSignals,
  analysis: SymbolAnalysis,
): Cell[] {
  const { maxima, bodyParagraphCount, axis } = analysis;
  const { front, back, body, firstBodyChapter: first, lastBodyChapter: last } = s.distribution;
  const ally = (s.item.co_occurring_imagery ?? [])[0] ?? null;

  return [
    {
      key: 'attach',
      label: t('symbol.signal.attach'),
      value: s.attachment
        ? t('symbol.signal.attachValue', {
            name: s.attachment.entity.name,
            hit: s.attachment.entity.body_count,
            of: body,
          })
        : t('symbol.signal.none'),
      fill: normalise(s.attachment?.score ?? 0, maxima.attachment),
      // The base rate is the whole point. 100% attachment to a character who is
      // in 60% of the book is a weaker finding than the percentage suggests, and
      // this is the one place with room to say so in full.
      note: s.attachment
        ? t('symbol.signal.attachNote', {
            name: s.attachment.entity.name,
            paragraphs: s.attachment.entity.paragraph_count,
            total: bodyParagraphCount,
            base: Math.round(s.attachment.expected * 100),
            lift: s.attachment.lift.toFixed(1),
          })
        : t('symbol.signal.attachNoteNone'),
    },
    {
      key: 'shape',
      label: t('symbol.signal.shape'),
      value: shapeLabel(t, s),
      // Coverage, not reach — reach is the next cell but one. Filling both bars
      // from `span` drew two identical bars whose only difference was the words
      // above them, which reads as a rendering fault rather than two findings.
      fill: normalise(s.distribution.bodyChapters.length, axis.bodyChapterCount),
      note:
        first === null || last === null
          ? t('symbol.signal.shapeNoteNone')
          : t('symbol.signal.shapeNote', {
              first,
              last,
              hit: s.distribution.bodyChapters.length,
              chapters: axis.bodyChapterCount,
            }),
    },
    {
      key: 'events',
      label: t('symbol.signal.events'),
      value: t('symbol.signal.eventsValue', { count: s.eventCount }),
      fill: normalise(s.eventCount, maxima.events),
      note:
        s.eventCount > 0
          ? t('symbol.signal.eventsNote', { max: maxima.events })
          : t('symbol.signal.eventsNoteNone'),
    },
    {
      key: 'allies',
      label: t('symbol.signal.allies'),
      value: t('symbol.signal.alliesValue', { count: s.allyCount }),
      fill: normalise(s.allyCount, maxima.allies),
      note: ally
        ? t('symbol.signal.alliesNote', {
            term: ally.term,
            count: ally.co_occurrence_count,
            max: maxima.allies,
          })
        : t('symbol.signal.alliesNoteNone'),
    },
    {
      key: 'arc',
      label: t('symbol.signal.arc'),
      value:
        first === null || last === null
          ? t('symbol.signal.none')
          : t('symbol.signal.arcValue', { first, last }),
      fill: Math.min(1, s.span),
      note: arcNote(t, s, axis.bodyChapterCount),
    },
    {
      key: 'trust',
      label: t('symbol.signal.trust'),
      value: t('symbol.signal.trustValue', { value: Math.round(s.trust * 100) }),
      fill: s.trust,
      // Back matter is stated separately from front matter because they are
      // treated differently: an afterword line can be the book's clearest
      // symbolic statement, so it counts as evidence. A colophon does not. The
      // clause is dropped entirely at zero — 「後記 0 次計為有效證據」 is not a fact
      // about the symbol, it is a template showing through.
      note: trustNote(t, front, back),
      warn: s.trust < TRUST_FLOOR,
    },
  ];
}

/** Which of the four front/back combinations the evidence actually is. */
function trustNote(t: TFunction<'analysis'>, front: number, back: number): string {
  if (front > 0) {
    return back > 0
      ? t('symbol.signal.trustNotePollutedBack', { count: front, back })
      : t('symbol.signal.trustNotePolluted', { count: front });
  }
  return back > 0
    ? t('symbol.signal.trustNoteCleanBack', { back })
    : t('symbol.signal.trustNoteClean');
}

/** What the exit chapter means, which is not the same as which chapter it is. */
function arcNote(t: TFunction<'analysis'>, s: SymbolSignals, bodyChapters: number): string {
  const { lastBodyChapter: last } = s.distribution;
  if (last === null) return t('symbol.signal.arcNoteNone');
  if (last >= bodyChapters) return t('symbol.signal.arcNoteToEnd');
  if (last <= bodyChapters * 0.3) return t('symbol.signal.arcNoteVanishes', { chapter: last });
  return t('symbol.signal.arcNoteEnds', { chapter: last });
}

/**
 * What a symbol does, before any token is spent on what it means.
 *
 * This card is the page's answer to its own normal state: on a book nobody has
 * run interpretation on, it is the only thing on the detail view with something
 * to say. So it says all six signals with their denominators rather than a score,
 * and states that it cost nothing — otherwise a reader assumes the empty
 * interpretation card below is the real content and this is a placeholder.
 */
export function BehaviourSummary({
  signals,
  analysis,
  rank,
}: Readonly<{ signals: SymbolSignals; analysis: SymbolAnalysis; rank: number | null }>) {
  const { t } = useTranslation('analysis');
  const rows = useMemo(() => cells(t, signals, analysis), [t, signals, analysis]);

  return (
    <section className="sym-card">
      <div className="sym-card-head">
        <Gauge size={13} style={{ color: 'var(--accent)' }} />
        <span className="sym-card-title">{t('symbol.signal.title')}</span>
        <span className="sym-card-meta">
          {rank === null
            ? t('symbol.signal.loadUnranked', { value: signals.load.toFixed(2) })
            : t('symbol.detail.rank', { rank, value: signals.load.toFixed(2) })}
        </span>
      </div>
      <div className="sym-card-body">
        <p className="sym-sig-free">{t('symbol.signal.free')}</p>
        <p className="sym-sig-claim">{claimSentence(t, signals)}</p>

        <div className="sym-sig-grid">
          {rows.map((cell) => (
            <div
              key={cell.key}
              className={'sym-sig-cell' + (cell.warn ? ' is-warn' : '')}
            >
              <div className="sym-sig-label">{cell.label}</div>
              <div className="sym-sig-value">{cell.value}</div>
              <div className="sym-sig-track">
                <span
                  className="sym-sig-fill"
                  style={{ width: `${Math.round(Math.min(1, cell.fill) * 100)}%` }}
                />
              </div>
              <div className="sym-sig-note">{cell.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
