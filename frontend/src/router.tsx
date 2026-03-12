import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const UploadPage = lazy(() => import('@/pages/UploadPage'));
const ReaderPage = lazy(() => import('@/pages/ReaderPage'));
const AnalysisPage = lazy(() => import('@/pages/AnalysisPage'));
const GraphPage = lazy(() => import('@/pages/GraphPage'));

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: (
          <LazyWrapper>
            <LibraryPage />
          </LazyWrapper>
        ),
      },
      {
        path: '/upload',
        element: (
          <LazyWrapper>
            <UploadPage />
          </LazyWrapper>
        ),
      },
      {
        path: '/books/:bookId',
        element: (
          <LazyWrapper>
            <ReaderPage />
          </LazyWrapper>
        ),
      },
      {
        path: '/books/:bookId/analysis',
        element: (
          <LazyWrapper>
            <AnalysisPage />
          </LazyWrapper>
        ),
      },
      {
        path: '/graph',
        element: (
          <LazyWrapper>
            <GraphPage />
          </LazyWrapper>
        ),
      },
    ],
  },
]);
