import { useRef, useEffect, useCallback } from 'react';
import type { MurmurEvent, MurmurEventType } from '@/api/types';
import { CharacterSlot } from './CharacterSlot';

// Murmur type → entity token stem (repo uses abbreviated names). Pill types
// render as a colored entity chip; topic renders as serif prose; raw as mono.
// Mirrors the design canvas mapMurmur (org→org, event→evt), with symbol folded
// into the concept hue.
const PILL_STEM: Partial<Record<MurmurEventType, string>> = {
  character: 'char',
  location: 'loc',
  org: 'org',
  event: 'evt',
  symbol: 'con',
};

function eyebrowOf(event: MurmurEvent): string {
  const chap = event.meta?.chapter;
  const chapText = typeof chap === 'number' ? ` · ch.${String(chap).padStart(2, '0')}` : '';
  return event.stepKey + chapText;
}

function roleOf(event: MurmurEvent): string {
  const role = event.meta?.role;
  return typeof role === 'string' ? role : '';
}

function PillContent({ event, stem }: Readonly<{ event: MurmurEvent; stem: string }>) {
  const role = roleOf(event);
  return (
    <div style={{ paddingLeft: 11 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          font: '500 11.5px/1 var(--font-sans)',
          background: `var(--entity-${stem}-bg)`,
          color: `var(--entity-${stem}-fg)`,
          border: `var(--pill-border-width) solid var(--entity-${stem}-border)`,
          borderRadius: 'var(--pill-radius)',
          padding: '3px 9px',
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: `var(--entity-${stem}-dot)` }} />
        {event.content}
      </span>
      {role && (
        <span style={{ font: '400 11.5px/1.5 var(--font-serif)', color: 'var(--fg-secondary)', marginLeft: 7 }}>
          {role}
        </span>
      )}
    </div>
  );
}

function MurmurContent({ event }: Readonly<{ event: MurmurEvent }>) {
  const stem = PILL_STEM[event.type];
  if (stem) return <PillContent event={event} stem={stem} />;
  if (event.type === 'raw') {
    return (
      <div style={{ font: '400 11px/1.5 var(--font-mono)', color: 'var(--fg-muted)', paddingLeft: 11 }}>
        {event.rawContent ?? event.content}
      </div>
    );
  }
  return (
    <p
      className="break-words"
      style={{ font: '400 13px/1.6 var(--font-serif)', color: 'var(--fg-primary)', margin: 0, paddingLeft: 11 }}
    >
      {event.content}
    </p>
  );
}

function MurmurEventRow({ event, isNew }: Readonly<{ event: MurmurEvent; isNew: boolean }>) {
  return (
    <div className="murmur-event-row" data-new={isNew} style={{ padding: '0 3px' }}>
      {/* eyebrow: accent dot + mono step·chapter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flex: 'none' }} />
        <span style={{ font: '400 10.5px/1 var(--font-mono)', color: 'var(--fg-muted)', letterSpacing: '.02em' }}>
          {eyebrowOf(event)}
        </span>
      </div>
      <MurmurContent event={event} />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '14px 15px' }}>
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
