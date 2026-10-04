import { useEffect } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { markBookOpened } from '@/api/books';
import { qk } from '@/api/queryKeys';
import { failureKind, techDetailOf } from '@/api/failureKind';
import { useBook } from '@/hooks/useBook';
import { BookNav } from './BookNav';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PageFailure } from '@/components/ui/PageFailure';
import { ChatContextProvider } from '@/contexts/ChatContext';
import { ChatWidget } from '@/components/chat/ChatWidget';

export function BookLayout() {
  const { bookId } = useParams<{ bookId: string }>();
  const { data: book, isLoading, error, refetch } = useBook(bookId);
  const { t } = useTranslation('reader');
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  // 進入任一書籍路由時蓋一次「最近開啟」；失敗不打擾使用者。
  useEffect(() => {
    if (!bookId) return;
    markBookOpened(bookId)
      .then(() => queryClient.invalidateQueries({ queryKey: qk.books, exact: true }))
      .catch(() => {});
  }, [bookId, queryClient]);

  // The reader (`/books/:bookId`) renders its own PageFailure (it also has the
  // 404「找不到書籍」state); every other book page gets the layout-level one
  // below. Either way the sidebar and title bar stay — never both at once.
  const isReaderRoute = pathname.replace(/\/$/, '') === `/books/${bookId}`;

  // The reader owns its loading state too: if the layout swapped it for a
  // spinner, the reader's own useBook would refetch the errored query on every
  // remount — react-query resets an errored, data-less query to pending — and
  // loop forever (mount → refetch → spinner → error → mount …).
  if (isLoading && !isReaderRoute) return <LoadingSpinner />;
  const showFailure = !!error && !isReaderRoute;

  return (
    <ChatContextProvider>
      <div className="flex flex-col flex-1 min-h-0">
        <BookNav bookId={bookId!} bookTitle={book?.title ?? ''} />
        {showFailure ? (
          // The Outlet is not mounted here, so no page-level useBook competes
          // with this one over the same errored query (see the reader note above).
          <div className="book-layout-failure">
            <PageFailure
              variant={failureKind(error)}
              pageName={t('failurePageName')}
              onRetry={() => void refetch()}
              techDetail={techDetailOf(error)}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <Outlet />
          </div>
        )}
      </div>
      <ChatWidget />
    </ChatContextProvider>
  );
}
