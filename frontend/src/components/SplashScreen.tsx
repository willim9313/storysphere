import { useCallback, useEffect, useRef, useState } from 'react';
import splashImg from '@/assets/splash/splash-main.png';

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [opacity, setOpacity] = useState(0);
  const doneRef = useRef(false);

  const dismiss = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setOpacity(0);
    setTimeout(onDone, 400);
  }, [onDone]);

  useEffect(() => {
    const t1 = setTimeout(() => setOpacity(1), 16);
    const t2 = setTimeout(dismiss, 2400); // ~400 fade-in + 2000 hold
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [dismiss]);

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        opacity,
        transition: 'opacity 0.4s ease',
        cursor: 'pointer',
      }}
    >
      {/* background image, dimmed */}
      <img
        src={splashImg}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.35,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
        draggable={false}
      />

      {/* title */}
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 'clamp(2rem, 6vw, 4rem)',
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: '#fff',
          textShadow: '0 2px 24px rgba(0,0,0,0.6)',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        StorySphere
      </span>
    </div>
  );
}
