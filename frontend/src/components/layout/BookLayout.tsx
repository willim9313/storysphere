import { useEffect } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { markBookOpened } from '@/api/books';
import { qk } from '@/api/queryKeys';
import { useBook } from '@/hooks/useBook';
import { BookNav } from './BookNav';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ChatContextProvider } from '@/contexts/ChatContext';
import { ChatWidget } from '@/components/chat/ChatWidget';

export function BookLayout() {
  const { bookId } = useParams<{ bookId: string }>();
  const { data: book, isLoading, error } = useBook(bookId);
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  // 進入任一書籍路由時蓋一次「最近開啟」；失敗不打擾使用者。
  useEffect(() => {
    if (!bookId) return;
    markBookOpened(bookId)
      .then(() => queryClient.invalidateQueries({ queryKey: qk.books, exact: true }))
      .catch(() => {});
  }, [bookId, queryClient]);

  // The reader (`/books/:bookId`) renders its own PageFailure inside the
  // content area so the sidebar and title bar stay; every other book page
  // still gets the layout-level ErrorMessage.
  const isReaderRoute = pathname.replace(/\/$/, '') === `/books/${bookId}`;

  if (isLoading) return <LoadingSpinner />;
  if (error && !isReaderRoute) return <ErrorMessage message={error.message} />;

  return (
    <ChatContextProvider>
      <div className="flex flex-col flex-1 min-h-0">
        <BookNav bookId={bookId!} bookTitle={book?.title ?? ''} />
        <div className="flex-1 min-h-0">
          <Outlet />
        </div>
      </div>
      <ChatWidget />
    </ChatContextProvider>
  );
}
