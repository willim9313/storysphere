import { Outlet, useParams } from 'react-router-dom';
import { useBook } from '@/hooks/useBook';
import { BookNav } from './BookNav';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export function BookLayout() {
  const { bookId } = useParams<{ bookId: string }>();
  const { data: book, isLoading, error } = useBook(bookId);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <BookNav bookId={bookId!} bookTitle={book?.title ?? ''} />
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
