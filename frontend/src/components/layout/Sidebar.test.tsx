import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Sidebar } from './Sidebar';

// useTranslation 不初始化 i18n 時回傳 key 本身，足以用 aria-label 定位各格。
function renderAt(path: string, activeCount = 0) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar tasksOpen={false} activeCount={activeCount} onToggleTasks={() => {}} />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  describe('釘選狀態遷移', () => {
    it('沒有任何 key 時預設收合', () => {
      const { container } = renderAt('/');
      expect(container.querySelector('.ss-sidebar')?.getAttribute('data-mode')).toBe('collapsed');
    });

    it('舊 key sidebar-expanded=true 對應到釘選', () => {
      localStorage.setItem('sidebar-expanded', 'true');
      const { container } = renderAt('/');
      expect(container.querySelector('.ss-sidebar')?.getAttribute('data-mode')).toBe('pinned');
    });

    it('新 key 有值時以新 key 為準，不再看舊 key', () => {
      localStorage.setItem('sidebar-expanded', 'true');
      localStorage.setItem('sidebar-pinned', 'false');
      const { container } = renderAt('/');
      expect(container.querySelector('.ss-sidebar')?.getAttribute('data-mode')).toBe('collapsed');
    });
  });

  describe('任務徽章', () => {
    it('計數為 0 不顯示', () => {
      const { container } = renderAt('/', 0);
      expect(container.querySelector('.ss-rail-badge')).toBeNull();
    });

    it('計數大於 0 時顯示，且任務中心是唯一的 button 格', () => {
      const { container } = renderAt('/', 3);
      expect(container.querySelector('.ss-rail-badge')?.textContent).toBe('3');
      // 收合鈕之外，只有任務中心是 <button>；其餘導航格都是 <a>。
      expect(container.querySelectorAll('button.ss-rail-item')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'tasks' })).toBeTruthy();
    });
  });

  describe('書籍群', () => {
    it('應用層路由沒有書籍群', () => {
      const { container } = renderAt('/upload');
      expect(container.querySelector('.ss-rail-book')).toBeNull();
    });

    it('書籍路由顯示九格，並標出目前檢視', () => {
      const { container } = renderAt('/books/b1/graph');
      expect(container.querySelectorAll('.ss-rail-book a')).toHaveLength(9);
      const active = container.querySelector('.ss-rail-book a.is-active');
      expect(active?.getAttribute('href')).toBe('/books/b1/graph');
    });

    it('矮視窗：系統群收進溢出選單，只剩書庫在側欄上', () => {
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      const { container } = renderAt('/books/b1');
      expect(container.querySelector('.ss-rail-more')).not.toBeNull();
      const railLinks = Array.from(container.querySelectorAll('.ss-sidebar > .ss-tooltip-anchor a'));
      expect(railLinks.map((a) => a.getAttribute('href'))).toEqual(['/']);
    });
  });
});
