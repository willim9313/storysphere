import { useEffect, useState, type CSSProperties } from 'react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';

type HealthState = 'checking' | 'ok' | 'down';

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: 'warm', label: 'Warm' },
  { value: 'ink', label: 'Ink' },
];

const HEALTH_VIEW: Record<HealthState, { className: string; text: string }> = {
  checking: { className: 'ss-badge ss-badge-info', text: '檢查後端連線中…' },
  ok: { className: 'ss-badge ss-badge-success', text: '後端連線正常' },
  down: { className: 'ss-badge ss-badge-error', text: '後端未連線' },
};

// 外殼版面只用 tokens.css 的變數，不寫死任何顏色或尺寸色值。
const shellStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--space-6)',
  padding: 'var(--space-8)',
  background: 'var(--bg-primary)',
  color: 'var(--fg-primary)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--font-size-3xl)',
  fontWeight: 600,
};

function App() {
  const { theme, setTheme } = useTheme();
  const [health, setHealth] = useState<HealthState>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v2/health', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body: { status?: string }) => setHealth(body.status === 'ok' ? 'ok' : 'down'))
      .catch(() => {
        // 元件卸載造成的中止不算連線失敗。
        if (!controller.signal.aborted) setHealth('down');
      });
    return () => controller.abort();
  }, []);

  const healthView = HEALTH_VIEW[health];

  return (
    <main style={shellStyle}>
      <h1 style={titleStyle}>StorySphere v4 原型</h1>
      <p className={healthView.className} role="status">
        {healthView.text}
      </p>
      <div className="ss-seg" role="group" aria-label="主題">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`ss-seg-item${theme === option.value ? ' active' : ''}`}
            aria-pressed={theme === option.value}
            onClick={() => setTheme(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </main>
  );
}

export default App;
