import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center h-full">
      <BookOpen size={48} style={{ color: 'var(--fg-muted)' }} />
      <h2
        className="mt-4 text-xl font-semibold"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        書庫尚無書籍
      </h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--fg-secondary)' }}>
        上傳一本小說，開始智能分析之旅。
      </p>
      <Link to="/upload" className="btn btn-primary mt-6">
        上傳新書
      </Link>
    </div>
  );
}
