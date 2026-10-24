import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import coverV2 from '@/assets/splash/cover_v2.png';

// Design contract (v2 ink-on-paper): splash imagery is line-art ink
// illustration only — no photography anywhere in chrome.
const IMAGERY_POOL = [
  {
    src: coverV2,
    themes: ['warm', 'ink'],
    credit: 'Reading · ink illustration',
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
      className="splash-root"
      style={{ opacity }}
    >
      {/* Background imagery — full bleed, faded, behind content */}
      {pick && (
        <div className="splash-bg">
          <img src={pick.src} alt="" className="splash-bg-img" draggable={false} />
          {/* 暈影只護住字標那一側（左），右側讓插畫自己呼吸 */}
          <div className="splash-vignette" />
        </div>
      )}

      {/* Foreground: wordmark + subtitle + loader */}
      <div className="splash-fg">
        <h1 className="splash-wordmark">StorySphere</h1>
        <p className="splash-subtitle">小說文本分析 · Literary analysis</p>
        <div className="splash-loader-track">
          <div className="splash-loader-bar" />
        </div>
      </div>

      {/* Image credit */}
      {pick && <span className="splash-credit">{pick.credit}</span>}
    </div>
  );
}
