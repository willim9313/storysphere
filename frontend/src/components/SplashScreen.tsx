import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import splashMain from '@/assets/splash/splash-main.png';
import libraryOfBooks from '@/assets/splash/library-of-books.png';

const IMAGERY_POOL = [
  {
    src: libraryOfBooks,
    themes: ['default', 'manuscript', 'minimal-ink', 'pulp'],
    credit: 'Library of Books · ink illustration',
  },
  {
    src: splashMain,
    themes: ['default'],
    credit: 'Sepia stack · photograph',
  },
];

function pickImage(theme: string) {
  const pool = IMAGERY_POOL.filter(it => it.themes.includes(theme));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

interface SplashScreenProps {
  readonly onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const { theme } = useTheme();
  const [opacity, setOpacity] = useState(0);
  const doneRef = useRef(false);
  const pick = useMemo(() => pickImage(theme), [theme]);

  const dismiss = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setOpacity(0);
    setTimeout(onDone, 400);
  }, [onDone]);

  useEffect(() => {
    const t1 = setTimeout(() => setOpacity(1), 16);
    const t2 = setTimeout(dismiss, 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [dismiss]);

  return (
    <div
      role="dialog"
      aria-label="StorySphere splash screen"
      tabIndex={0}
      onClick={dismiss}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && dismiss()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        opacity,
        transition: 'opacity 0.4s ease',
        cursor: 'pointer',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      {/* Background imagery — full bleed, faded, behind content */}
      {pick && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        >
          <img
            src={pick.src}
            alt=""
            className="splash-bg-img"
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              userSelect: 'none',
            }}
          />
          {/* Radial vignette — keeps centre calm so wordmark dominates */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse at center, transparent 30%, var(--bg-primary) 100%)',
            }}
          />
        </div>
      )}

      {/* Foreground: wordmark + subtitle + loader */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <h1
          className="splash-wordmark"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            fontWeight: 700,
            lineHeight: 1,
            color: 'var(--fg-primary)',
            letterSpacing: '-0.01em',
            margin: 0,
            userSelect: 'none',
          }}
        >
          StorySphere
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--fg-secondary)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            margin: 0,
            userSelect: 'none',
          }}
        >
          智能小說分析 · Literary analysis
        </p>
        <div className="splash-loader-track">
          <div className="splash-loader-bar" />
        </div>
      </div>

      {/* Image credit */}
      {pick && (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '10px',
            color: 'var(--fg-muted)',
            letterSpacing: '0.04em',
            position: 'absolute',
            right: '14px',
            bottom: '12px',
            zIndex: 2,
            opacity: 0.7,
            userSelect: 'none',
          }}
        >
          {pick.credit}
        </span>
      )}
    </div>
  );
}
