import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { DocumentSummary } from '@/api/types';

export function BookCard({ doc }: { doc: DocumentSummary }) {
  return (
    <Link
      to={`/books/${doc.id}`}
      className="card flex flex-col gap-3 hover:shadow-md transition-shadow"
    >
      <div
        className="flex items-center justify-center h-32 rounded-md"
        style={{ backgroundColor: 'var(--color-accent-subtle)' }}
      >
        <FileText size={32} style={{ color: 'var(--color-accent)' }} />
      </div>
      <div>
        <h3
          className="font-semibold text-sm line-clamp-2"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {doc.title}
        </h3>
        <span
          className="inline-block mt-1 px-2 py-0.5 text-xs rounded"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-muted)',
          }}
        >
          {doc.file_type.toUpperCase()}
        </span>
      </div>
    </Link>
  );
}
