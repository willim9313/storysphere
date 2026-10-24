import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  DEFAULT_TYPOGRAPHY,
  formatTypography,
  isOverridden,
  resolveTypography,
  type ReaderPrefs,
  type Step,
  type Typography,
  type Warmth,
} from './readerModel';

const FS_KEYS = ['small', 'standard', 'large'] as const;
const LH_KEYS = ['tight', 'standard', 'wide'] as const;
const WARMTH_COUNT = 4;
const STEPS = [0, 1, 2] as const;

/**
 * Reader toolbar "Aa" button + 220px popover: font size / line height (kept
 * shared by 檢視 / 專注, with the default and a way back to it), paper
 * warmth (Warm only — Ink renders none of it) and the fade-in toggle. State is
 * fully controlled; ReaderPage owns `reader:prefs`.
 */
export function TypographyPanel({
  prefs,
  onTypography,
  onResetTypography,
  onPrefs,
}: {
  readonly prefs: ReaderPrefs;
  readonly onTypography: (patch: Partial<Typography>) => void;
  readonly onResetTypography: () => void;
  readonly onPrefs: (patch: Partial<Pick<ReaderPrefs, 'warmth' | 'fade'>>) => void;
}) {
  const { t } = useTranslation('reader');
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Esc closes and hands focus back to Aa, wherever focus was inside the panel.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const current = resolveTypography(prefs);
  const overridden = isOverridden(prefs);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`ss-btn ss-btn-sm ss-btn-ghost${open ? ' rd-tool-on' : ''}`}
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {t('typography.trigger')}
      </button>
      {open && (
        <div id={panelId} className="rd-typo">
          <div className="rd-typo-group">
            <div className="rd-typo-line is-muted">
              <span>{t('typography.modeDefault')}</span>
              <span className="rd-typo-mono">{formatTypography(DEFAULT_TYPOGRAPHY)}</span>
            </div>
            <div className="rd-typo-line">
              <span>{t('typography.current')}</span>
              <span className="rd-typo-mono">{formatTypography(current)}</span>
            </div>
            {overridden && (
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-ghost"
                style={{ alignSelf: 'flex-start' }}
                onClick={onResetTypography}
              >
                {t('typography.resetToDefault')}
              </button>
            )}
          </div>

          <div className="rd-typo-group">
            <span className="rd-typo-label">{t('typography.fontSize')}</span>
            <div className="rd-typo-seg">
              {STEPS.map((i) => (
                <button
                  key={i}
                  type="button"
                  className={current.fs === i ? 'active' : undefined}
                  aria-pressed={current.fs === i}
                  onClick={() => onTypography({ fs: i as Step })}
                >
                  {t(`typography.fs.${FS_KEYS[i]}`)}
                </button>
              ))}
            </div>
            <span className="rd-typo-mono">15 / 17 / 19 px</span>
          </div>

          <div className="rd-typo-group">
            <span className="rd-typo-label">{t('typography.lineHeight')}</span>
            <div className="rd-typo-seg">
              {STEPS.map((i) => (
                <button
                  key={i}
                  type="button"
                  className={current.lh === i ? 'active' : undefined}
                  aria-pressed={current.lh === i}
                  onClick={() => onTypography({ lh: i as Step })}
                >
                  {t(`typography.lh.${LH_KEYS[i]}`)}
                </button>
              ))}
            </div>
            <span className="rd-typo-mono">1.6 / 1.85 / 2.15</span>
          </div>

          {theme === 'warm' && (
            <div className="rd-typo-group">
              <span className="rd-typo-label">{t('typography.warmth')}</span>
              <div className="rd-typo-swatches">
                {Array.from({ length: WARMTH_COUNT }, (_, i) => (
                  <Tooltip key={i} label={t('typography.warmthSwatch', { n: i + 1 })}>
                    <button
                      type="button"
                      aria-label={t('typography.warmthSwatch', { n: i + 1 })}
                      aria-pressed={prefs.warmth === i}
                      onClick={() => onPrefs({ warmth: i as Warmth })}
                      className={prefs.warmth === i ? 'rd-typo-swatch active' : 'rd-typo-swatch'}
                      style={{ background: `var(--paper-warmth-${i})` }}
                    />
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          <label className="rd-typo-fade">
            <span>{t('typography.fadeIn')}</span>
            <input
              type="checkbox"
              className={`ss-toggle${prefs.fade ? ' is-on' : ''}`}
              checked={prefs.fade}
              onChange={() => onPrefs({ fade: !prefs.fade })}
              aria-label={t('typography.fadeIn')}
            />
          </label>
        </div>
      )}
    </div>
  );
}
