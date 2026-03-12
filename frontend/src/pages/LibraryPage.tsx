import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchDocuments } from '@/api/documents';
import { BookCard } from '@/components/library/BookCard';
import { EmptyLibrary } from '@/components/library/EmptyLibrary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export default function LibraryPage() {
  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: fetchDocuments,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!documents?.length) return <EmptyLibrary />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-serif)' }}>
          Library
        </h1>
        <Link to="/upload" className="btn btn-primary">
          <Plus size={16} />
          Upload
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {documents.map((doc) => (
          <BookCard key={doc.id} doc={doc} />
        ))}
      </div>
    </div>
  );
}
