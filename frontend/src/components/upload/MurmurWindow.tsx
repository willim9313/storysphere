import { useRef, useEffect, useCallback } from 'react';
import type { MurmurEvent, MurmurEventType } from '@/api/types';
import { CharacterSlot } from './CharacterSlot';

// Maps event type to entity color token
const DOT_COLOR: Record<MurmurEventType, string> = {
  character: 'var(--entity-char-dot)',
  location:  'var(--entity-loc-dot)',
  org:       'var(--entity-org-dot)',
  event:     'var(--entity-con-dot)',
  topic:     'var(--entity-obj-dot)',
  symbol:    'var(--entity-con-dot)',
  raw:       'var(--fg-muted)',
};

interface MurmurWindowProps {
  events: MurmurEvent[];
  characterSrc?: string;
}

function MurmurEventRow({ event, isNew }: Readonly<{ event: MurmurEvent; isNew: boolean }>) {
  const isRaw = event.type === 'raw';
  const dotColor = DOT_COLOR[event.type] ?? 'var(--fg-muted)';

  return (
    <div
      className="murmur-event-row px-3 py-1.5"
      data-new={isNew}
      style={{ opacity: isNew ? undefined : 0.75 }}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="mt-1 flex-shrink-0 rounded-full"
          style={{ width: 6, height: 6, backgroundColor: dotColor, marginTop: 5 }}
        />
        <div className="flex-1 min-w-0">
          <span className="text-xs" style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-sans)' }}>
            {event.stepKey}
            {event.meta?.chapter != null && (
              <> · ch.{String(event.meta.chapter).padStart(2, '0')}</>
            )}
          </span>
          <p
            className={`text-xs mt-0.5 break-words ${isRaw ? 'font-mono' : ''}`}
            style={{
              color: 'var(--fg-primary)',
              ...(isRaw ? {
                border: '1px dashed var(--border)',
                borderRadius: 4,
                padding: '2px 4px',
                backgroundColor: 'var(--bg-tertiary)',
              } : {}),
            }}
          >
            {event.type !== 'raw' && event.meta?.role && (
              <span style={{ color: 'var(--fg-secondary)', fontWeight: 500 }}>
                {String(event.meta.role)} ·{' '}
              </span>
            )}
            {event.rawContent ?? event.content}
          </p>
        </div>
      </div>
    </div>
  );
}

export function MurmurWindow({ events, characterSrc }: Readonly<MurmurWindowProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevLengthRef = useRef(events.length);

  const checkAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
  }, []);

  useEffect(() => {
    if (events.length === prevLengthRef.current) return;
    prevLengthRef.current = events.length;
    if (isAtBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .murmur-event-row { animation: none !important; }
        }
        .murmur-event-row[data-new="true"] {
          animation: slideUp 0.25s ease-out forwards;
        }
      `}</style>
      {/* Outer wrapper is the position:relative anchor so CharacterSlot
          stays pinned to the visible corner, not the scrollable content */}
      <div style={{ position: 'relative' }}>
        <div
          ref={containerRef}
          onScroll={checkAtBottom}
          style={{
            height: 260,
            overflowY: 'auto',
            borderRadius: 8,
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: events.length === 0 ? 'center' : undefined,
          }}
        >
          {events.length === 0 ? (
            <p className="text-xs text-center" style={{ color: 'var(--fg-muted)', padding: '0 16px' }}>
              等待系統開始處理…
            </p>
          ) : (
            <div className="flex flex-col py-1">
              {events.map((event, idx) => (
                <MurmurEventRow
                  key={event.seq}
                  event={event}
                  isNew={idx === events.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* CharacterSlot pinned to visible bottom-right of the scroll container */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <CharacterSlot src={characterSrc} />
        </div>
      </div>
    </>
  );
}
