import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { queryClient } from '@/api/queryClient';
import { AppRoot } from '@/components/AppRoot';
import './i18n';
import './styles/global.css';
// After global.css on purpose: Tailwind preflight's `[type='button']` rule has
// the same specificity as a kit class and would otherwise win on source order.
import './styles/ss-kit.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppRoot />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
