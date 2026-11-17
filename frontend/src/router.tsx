import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { NotBuiltPage } from '@/pages/NotBuiltPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { IngestPage } from '@/pages/IngestPage';

// 05 §3 的九個畫面；工作中心是抽屜，不是路由。
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <LibraryPage /> },
      { path: '/books/:bookId', element: <NotBuiltPage title="書籍總覽" inBook /> },
      { path: '/books/:bookId/ingest', element: <IngestPage /> },
      { path: '/books/:bookId/runs/:runId', element: <NotBuiltPage title="結果卡詳情" inBook /> },
      { path: '/books/:bookId/agent', element: <NotBuiltPage title="Agent 工作區" inBook /> },
      { path: '/books/:bookId/notes', element: <NotBuiltPage title="筆記" inBook /> },
      { path: '/books/:bookId/evidence', element: <NotBuiltPage title="證據瀏覽" inBook /> },
      { path: '/registry', element: <NotBuiltPage title="方法目錄" /> },
      { path: '/settings', element: <NotBuiltPage title="設定" /> },
      { path: '*', element: <NotBuiltPage title="找不到這個頁面" /> },
    ],
  },
]);
