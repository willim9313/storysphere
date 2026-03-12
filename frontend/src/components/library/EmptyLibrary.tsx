import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <BookOpen size={48} style={{ color: 'var(--color-text-muted)' }} />
      <h2
        className="mt-4 text-xl font-semibold"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        Your library is empty
      </h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Upload a novel to get started with analysis.
      </p>
      <Link to="/upload" className="btn btn-primary mt-6">
        Upload a Book
      </Link>
    </div>
  );
}
