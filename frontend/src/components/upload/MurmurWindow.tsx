import { memo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { MurmurEvent } from '@/api/types';
import { CharacterSlot } from './CharacterSlot';
import { murmurPillVariant } from './uploadModel';

// The step's own name (as in the timeline), not the camelCase key; an
// unknown key still shows as itself rather than vanishing.
function eyebrowOf(event: MurmurEvent, t: TFunction<'upload'>): string {
  const chap = event.meta?.chapter;
  const chapText = typeof chap === 'number' ? ` · ch.${String(chap).padStart(2, '0')}` : '';
  return t(`steps.${event.stepKey}`, { defaultValue: event.stepKey }) + chapText;
}

function roleOf(event: MurmurEvent): string {
  const role = event.meta?.role;
  return typeof role === 'string' ? role : '';
}

// Three content shapes share one stream: entity pill (+ serif role), serif
// prose for topic, mono for raw.
// memo: an event never changes once received, so a row renders once.
const MurmurContent = memo(function MurmurContent({ event }: Readonly<{ event: MurmurEvent }>) {
  const variant = murmurPillVariant(event.type);
  if (variant) {
    const role = roleOf(event);
    return (
      <div className="up-murmur-body">
        <span className={`ss-pill ss-pill-${variant}`}>
          <span className="ss-pill-dot" />
          {event.content}
        </span>
        {role && <span className="up-murmur-role">{role}</span>}
      </div>
    );
  }
  if (event.type === 'raw') {
    return <code className="up-murmur-raw">{event.rawContent ?? event.content}</code>;
  }
  return <p className="up-murmur-topic">{event.content}</p>;
});

interface MurmurWindowProps {
  events: MurmurEvent[];
  /** Optional mascot art for the pinned CharacterSlot; falls back to its icon. */
  characterSrc?: string;
}

// memo: the store hands out a new array only when events arrive, so the card's
// other re-renders (polls, state) skip the list.
export const MurmurWindow = memo(function MurmurWindow({ events, characterSrc }: Readonly<MurmurWindowProps>) {
  const { t } = useTranslation('upload');
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevLengthRef = useRef(events.length);

  const checkAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
  }, []);

  // On mount (e.g. returning to the upload page with events already in the
  // store) start pinned to the latest message, not the oldest. useLayoutEffect
  // so we land at the bottom before paint — no visible jump from the top.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Stick to the bottom as deltas arrive — but only while the reader is
  // already there; scrolling up to read is never yanked back.
  useEffect(() => {
    if (events.length === prevLengthRef.current) return;
    prevLengthRef.current = events.length;
    if (isAtBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    // The column is the position:relative anchor so the CharacterSlot stays
    // pinned to the visible corner, not to the scrolling content.
    <div className="up-murmur-col">
      <div
        ref={containerRef}
        onScroll={checkAtBottom}
        className={events.length === 0 ? 'up-murmur up-murmur-empty' : 'up-murmur'}
      >
        {events.length === 0 ? (
          <span className="up-murmur-empty-text">{t('murmurEmpty')}</span>
        ) : (
          events.map((event, idx) => (
            <div key={event.seq} className="up-murmur-item" data-new={idx === events.length - 1}>
              <span className="up-murmur-eyebrow">{eyebrowOf(event, t)}</span>
              <MurmurContent event={event} />
            </div>
          ))
        )}
      </div>
      <div className="up-mascot-pin">
        <CharacterSlot src={characterSrc} />
      </div>
    </div>
  );
});
