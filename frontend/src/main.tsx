import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/contexts/ThemeContext';
import App from './App';
import './styles/global.css';
// 刻意排在 global.css 之後：Tailwind preflight 的 `[type='button']` 規則與 kit class
// 權重相同，若順序相反會因為來源順序而蓋掉 kit 的樣式。
import './styles/ss-kit.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
