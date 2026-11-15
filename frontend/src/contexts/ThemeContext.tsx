import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'warm' | 'ink';

const STORAGE_KEY = 'storysphere:theme';
// 與 index.html 的 FOUC 預載腳本保持一致。
const VALID_THEMES = new Set<Theme>(['warm', 'ink']);

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.has(stored as Theme) ? (stored as Theme) : 'warm';
  });

  // 用 layout effect 而非一般 effect：子元件可能在自己的 effect 裡讀取新主題的
  // CSS 變數，而一般 effect 是子元件先跑，會讀到上一個主題的值。
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Hook 刻意與 provider 放在同一檔；只影響 HMR 的粒度。
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
