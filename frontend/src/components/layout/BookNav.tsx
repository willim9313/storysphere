import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBook } from '@/api/books';

/** 書籍層的麵包屑：← 書庫 | 書名 › 目前畫面（畫布 `.ss-booknav`）。 */
export function BookNav({ view }: Readonly<{ view: string }>) {
  const { bookId = '' } = useParams();
  const { data: book } = useBook(bookId);
  return (
    <header className="ss-booknav">
      <Link className="ss-booknav-back" to="/">
        <ArrowLeft size={12} aria-hidden="true" />
        書庫
      </Link>
      <span className="ss-booknav-sep">|</span>
      <Link className="ss-booknav-title" to={`/books/${bookId}`} style={{ textDecoration: 'none' }}>
        {book?.title ?? '…'}
      </Link>
      <span className="ss-booknav-chev">›</span>
      <span className="ss-booknav-view">{view}</span>
    </header>
  );
}
