import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { BookLayout } from '@/components/layout/BookLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const UploadPage = lazy(() => import('@/pages/UploadPage'));
const ReaderPage = lazy(() => import('@/pages/ReaderPage'));
const AnalysisPage = lazy(() => import('@/pages/AnalysisPage'));
const GraphPage = lazy(() => import('@/pages/GraphPage'));
const TimelinePage = lazy(() => import('@/pages/TimelinePage'));
const TensionPage = lazy(() => import('@/pages/TensionPage'));
const SymbolsPage = lazy(() => import('@/pages/SymbolsPage'));
const UnravelingPage = lazy(() => import('@/pages/UnravelingPage'));
const FrameworksPage = lazy(() => import('@/pages/FrameworksPage'));
const TokenUsagePage = lazy(() => import('@/pages/TokenUsagePage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

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
        path: '/frameworks',
        element: (
          <LazyWrapper>
            <FrameworksPage />
          </LazyWrapper>
        ),
      },
      {
        path: '/token-usage',
        element: (
          <LazyWrapper>
            <TokenUsagePage />
          </LazyWrapper>
        ),
      },
      {
        path: '/settings',
        element: (
          <LazyWrapper>
            <SettingsPage />
          </LazyWrapper>
        ),
      },
      {
        path: '/books/:bookId',
        element: <BookLayout />,
        children: [
          {
            index: true,
            element: (
              <LazyWrapper>
                <ReaderPage />
              </LazyWrapper>
            ),
          },
          {
            path: 'analysis',
            element: (
              <LazyWrapper>
                <AnalysisPage />
              </LazyWrapper>
            ),
          },
          {
            path: 'graph',
            element: (
              <LazyWrapper>
                <GraphPage />
              </LazyWrapper>
            ),
          },
          {
            path: 'timeline',
            element: (
              <LazyWrapper>
                <TimelinePage />
              </LazyWrapper>
            ),
          },
          {
            path: 'tension',
            element: (
              <LazyWrapper>
                <TensionPage />
              </LazyWrapper>
            ),
          },
          {
            path: 'symbols',
            element: (
              <LazyWrapper>
                <SymbolsPage />
              </LazyWrapper>
            ),
          },
          {
            path: 'unraveling',
            element: (
              <LazyWrapper>
                <UnravelingPage />
              </LazyWrapper>
            ),
          },
        ],
      },
    ],
  },
]);
