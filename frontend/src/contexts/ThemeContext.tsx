import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'warm' | 'ink';

const STORAGE_KEY = 'storysphere:theme';
const VALID_THEMES = new Set<Theme>(['warm', 'ink']);

// v2 (2026-07): the four-theme system collapsed into Warm + Ink.
// Mirrors the FOUC bootstrap map in index.html.
const LEGACY_THEMES: Record<string, Theme> = {
  default: 'warm',
  manuscript: 'warm',
  'minimal-ink': 'ink',
  pulp: 'ink',
};

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in LEGACY_THEMES) return LEGACY_THEMES[stored];
    return VALID_THEMES.has(stored as Theme) ? (stored as Theme) : 'warm';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Hook co-located with its provider (intentional); only affects HMR granularity.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
