import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';

/** Persisted reader typography preferences — see ReaderPage's `reader:prefs` localStorage key. */
export interface ReaderPrefs {
  /** Body font size: 0=15px / 1=17px / 2=19px. */
  fs: 0 | 1 | 2;
  /** Body line height: 0=1.6 / 1=1.85 / 2=2.15. */
  lh: 0 | 1 | 2;
  /** Paper warmth swatch index (Warm theme only; Ink ignores this). */
  warmth: 0 | 1 | 2 | 3;
  /** Per-chunk fade-in-on-scroll. */
  fade: boolean;
}

// Constant co-located with the component that defines its shape (intentional,
// mirrors ThemeContext.tsx); only affects HMR granularity for this file.
// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_READER_PREFS: ReaderPrefs = { fs: 1, lh: 1, warmth: 1, fade: false };

const FS_KEYS = ['small', 'standard', 'large'] as const;
const LH_KEYS = ['tight', 'standard', 'wide'] as const;
const WARMTH_COUNT = 4;

const triggerStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  borderRadius: 6,
  backgroundColor: active ? 'var(--accent)' : 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: active ? 'white' : 'var(--fg-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--font-size-2xs)',
  fontWeight: 600,
});

const segButtonStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '5px 0',
  borderRadius: 6,
  border: '1px solid var(--border)',
  backgroundColor: active ? 'var(--accent)' : 'var(--bg-secondary)',
  color: active ? 'white' : 'var(--fg-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--font-size-2xs)',
});

const sectionLabelStyle: React.CSSProperties = {
  marginBottom: 6,
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--font-size-2xs)',
  color: 'var(--fg-muted)',
};

/**
 * Reader toolbar "Aa" button + popover panel: font size / line height / paper
 * warmth (Warm theme only) / fade-in toggle. State is fully controlled — the
 * caller (ReaderPage) owns `prefs` and persists it to localStorage.
 */
export function TypographyPanel({
  prefs,
  onChange,
}: {
  readonly prefs: ReaderPrefs;
  readonly onChange: (patch: Partial<ReaderPrefs>) => void;
}) {
  const { t } = useTranslation('reader');
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button onClick={() => setOpen((v) => !v)} style={triggerStyle(open)}>
        {t('typography.trigger')}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 220,
            zIndex: 20,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--card-radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: 14,
            animation: 'rd-pop .16s ease',
          }}
        >
          <div style={sectionLabelStyle}>{t('typography.fontSize')}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {([0, 1, 2] as const).map((i) => (
              <button key={i} onClick={() => onChange({ fs: i })} style={segButtonStyle(prefs.fs === i)}>
                {t(`typography.fs.${FS_KEYS[i]}`)}
              </button>
            ))}
          </div>

          <div style={sectionLabelStyle}>{t('typography.lineHeight')}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {([0, 1, 2] as const).map((i) => (
              <button key={i} onClick={() => onChange({ lh: i })} style={segButtonStyle(prefs.lh === i)}>
                {t(`typography.lh.${LH_KEYS[i]}`)}
              </button>
            ))}
          </div>

          {theme === 'warm' && (
            <>
              <div style={sectionLabelStyle}>{t('typography.warmth')}</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {Array.from({ length: WARMTH_COUNT }, (_, i) => (
                  <button
                    key={i}
                    title={t('typography.warmthSwatch', { n: i + 1 })}
                    aria-label={t('typography.warmthSwatch', { n: i + 1 })}
                    onClick={() => onChange({ warmth: i as 0 | 1 | 2 | 3 })}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: `var(--paper-warmth-${i})`,
                      border: prefs.warmth === i ? '2px solid var(--accent)' : '1px solid var(--border)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)' }}>
              {t('typography.fadeIn')}
            </span>
            <input
              type="checkbox"
              className={`ss-toggle${prefs.fade ? ' is-on' : ''}`}
              checked={prefs.fade}
              onChange={() => onChange({ fade: !prefs.fade })}
              aria-label={t('typography.fadeIn')}
            />
          </label>
        </div>
      )}
    </div>
  );
}
