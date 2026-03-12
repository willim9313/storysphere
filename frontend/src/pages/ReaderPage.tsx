import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Menu, X } from 'lucide-react';
import { fetchDocument } from '@/api/documents';
import { useEntities } from '@/hooks/useEntities';
import { ChapterList } from '@/components/reader/ChapterList';
import { ChapterContent } from '@/components/reader/ChapterContent';
import { AnalysisTrigger } from '@/components/reader/AnalysisTrigger';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ['documents', bookId],
    queryFn: () => fetchDocument(bookId!),
    enabled: !!bookId,
  });

  const { data: entityData } = useEntities({ limit: 500 });
  const entities = entityData?.items ?? [];

  // Auto-select first chapter
  if (doc && selectedChapter === null && doc.chapters.length > 0) {
    setSelectedChapter(doc.chapters[0].number);
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!doc) return <ErrorMessage message="Document not found" />;

  const currentChapter = doc.chapters.find((c) => c.number === selectedChapter);

  return (
    <div className="flex gap-0 -mx-6 -mt-6" style={{ height: 'calc(100vh - 57px)' }}>
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 overflow-hidden transition-all duration-200 border-r`}
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        <div className="w-64 p-4">
          <h2
            className="text-lg font-bold mb-4 truncate"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {doc.title}
          </h2>
          <ChapterList
            chapters={doc.chapters}
            selectedNumber={selectedChapter}
            onSelect={setSelectedChapter}
          />
          <AnalysisTrigger bookId={bookId!} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-2 px-6 py-2 border-b"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {currentChapter && (
            <span className="text-sm font-medium">
              {currentChapter.title ?? `Chapter ${currentChapter.number}`}
            </span>
          )}
        </div>
        <div className="max-w-3xl mx-auto px-6 py-8">
          {currentChapter ? (
            <ChapterContent
              documentId={bookId!}
              chapter={currentChapter}
              entities={entities}
            />
          ) : (
            <p style={{ color: 'var(--color-text-muted)' }}>Select a chapter to begin reading.</p>
          )}
        </div>
      </div>
    </div>
  );
}
