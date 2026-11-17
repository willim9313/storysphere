import { useTheme, type Theme } from '@/contexts/ThemeContext';
import { useDevView } from '@/hooks/useDevView';
import { SettingsSection } from './SettingsSection';

const THEMES: { id: Theme; name: string; sub: string }[] = [
  { id: 'warm', name: 'Warm', sub: '暖象牙紙上的墨線' },
  { id: 'ink', name: 'Ink', sub: '白紙上的純黑鋼筆稿' },
];

/** 外觀：Warm／Ink（ThemeContext，存在這個瀏覽器）。 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsSection id="settings-look" title="外觀">
      <div className="ss-theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={theme === t.id}
            className={`ss-theme-card${theme === t.id ? ' active' : ''}`}
            data-theme-preview={t.id}
            onClick={() => setTheme(t.id)}
          >
            <span className="ss-theme-swatch" aria-hidden="true">
              <span className="bg-1" />
              <span className="bg-2" />
              <span className="bg-3" />
              <span className="ac" />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span className="ss-theme-name">{t.name}</span>
              <span className="ss-theme-sub">{t.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </SettingsSection>
  );
}

/** 開發者檢視（05 §1）：存在這個瀏覽器，原型預設開。 */
export function DevViewSection() {
  const [devView, setDevView] = useDevView();
  return (
    <section
      aria-labelledby="settings-dev"
      style={{
        background: 'var(--bg-primary)',
        border: 'var(--card-border-width) var(--border-style) var(--border)',
        borderRadius: 'var(--card-radius)',
        boxShadow: 'var(--card-shadow)',
        padding: 'var(--space-5) var(--space-6)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-6)',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h2 id="settings-dev" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
          開發者檢視
        </h2>
        <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
          顯示第 1 層證據與原始 trace，用來檢查抽取品質。原型預設開啟；設定只存在這個瀏覽器。
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={devView}
        aria-labelledby="settings-dev"
        className={devView ? 'ss-toggle is-on' : 'ss-toggle'}
        onClick={() => setDevView(!devView)}
      />
    </section>
  );
}
