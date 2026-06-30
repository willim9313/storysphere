interface CharacterSlotProps {
  src?: string;
  icon?: React.ReactNode;
}

export function CharacterSlot({ src, icon }: Readonly<CharacterSlotProps>) {
  return (
    <>
      <style>{`
        @keyframes bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .character-slot-inner { animation: none !important; }
        }
      `}</style>
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{
          width: 56,
          height: 56,
          border: '1.5px dashed var(--border)',
          backgroundColor: 'var(--bg-tertiary)',
        }}
      >
        <div
          className="character-slot-inner flex items-center justify-center"
          style={{ animation: 'bob 2s ease-in-out infinite' }}
        >
          {src ? (
            <img src={src} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          ) : icon ? (
            icon
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          )}
        </div>
      </div>
    </>
  );
}
