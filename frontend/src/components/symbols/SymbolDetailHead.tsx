import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pin, PinOff } from 'lucide-react';

import { TypePill } from './Badges';
import type { SymbolSignals } from './symbolSignals';

/** Below this, a symbol's evidence is partly front matter and is flagged as such. */
const TRUST_FLOOR = 0.8;

interface Props {
  signals: SymbolSignals;
  /**
   * Position in the ranked list, 1-based, or null for a tail word.
   *
   * Null rather than a number because the tail is deliberately unranked: printing
   * 「第 23 名」 beside a word that occurs once would claim it lost a comparison it
   * was never entered into.
   */
  rank: number | null;
  onBack: () => void;
  /** The symbol currently held for comparison, if any. */
  pinned: { id: string; term: string } | null;
  setPinned: (id: string | null) => void;
}

/**
 * How many occurrences there are, and where they are.
 *
 * A bare 「13 次出現」 is the number this redesign exists to stop leading with:
 * 5 of 海's 13 are the colophon and the title page. The breakdown is in the same
 * line as the total so the two cannot be read apart.
 */
function occurrenceLine(
  t: ReturnType<typeof useTranslation<'analysis'>>['t'],
  signals: SymbolSignals,
): string {
  const { front, body, back } = signals.distribution;
  const parts = [
    t('symbol.frequency', { count: signals.frequency }),
    t('symbol.detail.occBody', { count: body }),
  ];
  if (front > 0) parts.push(t('symbol.detail.occFront', { count: front }));
  if (back > 0) parts.push(t('symbol.detail.occBack', { count: back }));
  return parts.join(t('symbol.detail.occSeparator'));
}

/**
 * Hold one symbol's distribution on screen while reading another's.
 *
 * Three states rather than a toggle, because "pinned" and "pinned to something
 * else" are different situations for the reader: with 手 pinned and 海 open, the
 * useful action is to drop the comparison, not to replace it — replacing means
 * navigating to the other symbol anyway, where its own button says 「取消並看」.
 */
function PinControl({
  signals,
  pinned,
  setPinned,
}: Readonly<{
  signals: SymbolSignals;
  pinned: { id: string; term: string } | null;
  setPinned: (id: string | null) => void;
}>) {
  const { t } = useTranslation('analysis');

  if (pinned === null) {
    return (
      <button type="button" className="sym-pin-btn" onClick={() => setPinned(signals.id)}>
        <Pin size={11} aria-hidden="true" />
        {t('symbol.pin.set')}
      </button>
    );
  }
  const isSelf = pinned.id === signals.id;
  return (
    <button
      type="button"
      className="sym-pin-btn is-active"
      onClick={() => setPinned(null)}
      title={t('symbol.pin.clearTitle')}
    >
      <PinOff size={11} aria-hidden="true" />
      {isSelf ? t('symbol.pin.clearSelf') : t('symbol.pin.clearOther', { term: pinned.term })}
    </button>
  );
}

export function SymbolDetailHead({
  signals,
  rank,
  onBack,
  pinned,
  setPinned,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const noisy = signals.trust < TRUST_FLOOR;

  return (
    <header className="sym-detail-head">
      {/* The type chip in the sidebar used to be the only way back to the map.
          A reader who had scrolled the detail view had to scroll the other
          column to find it. */}
      <nav className="sym-crumbs">
        <button type="button" className="sym-crumb-back" onClick={onBack}>
          <ArrowLeft size={12} aria-hidden="true" />
          {t('symbol.detail.backToMap')}
        </button>
        <span className="sym-crumb-sep" aria-hidden="true">
          /
        </span>
        <span className="sym-crumb-here">{signals.term}</span>
        <PinControl signals={signals} pinned={pinned} setPinned={setPinned} />
      </nav>

      <div className="sym-detail-title-row">
        <h1 className="sym-detail-title">{signals.term}</h1>
        <TypePill type={signals.imageryType} />
        {rank !== null && (
          <span className="sym-detail-rank">
            {t('symbol.detail.rank', { rank, value: signals.load.toFixed(2) })}
          </span>
        )}
        {/* Pushed right by `.sym-detail-freq`'s own `margin-left: auto`. */}
        <span
          className="sym-detail-freq"
          // Stated in the warning colour rather than left to be discovered in the
          // behaviour card: the total right beside it is the misleading figure.
          style={noisy ? { color: 'var(--status-partial-fg)' } : undefined}
        >
          {occurrenceLine(t, signals)}
        </span>
      </div>

      {signals.aliases.length > 0 && (
        <div className="sym-detail-aliases">
          <span className="sym-aliases-label">{t('symbol.aliases')}</span>
          {signals.aliases.map((a) => (
            <span key={a} className="sym-alias-pill">
              {a}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
