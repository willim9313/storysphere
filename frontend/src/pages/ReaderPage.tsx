import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Brain } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { useBook } from '@/hooks/useBook';
import { useChapters } from '@/hooks/useChapters';
import { useChunks } from '@/hooks/useChunks';
import { BookOverview } from '@/components/reader/BookOverview';
import { ChapterCard } from '@/components/reader/ChapterCard';
import { ChunkCard } from '@/components/reader/ChunkCard';
import { BezierConnectors } from '@/components/reader/BezierConnectors';
import { EpistemicSidePanel } from '@/components/reader/EpistemicSidePanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { t } = useTranslation('reader');
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [viewingChapterId, setViewingChapterId] = useState<string | null>(null);
  const [epistemicOpen, setEpistemicOpen] = useState(false);

  const col1Ref = useRef<HTMLDivElement>(null);
  const col2Ref = useRef<HTMLDivElement>(null);
  const col3Ref = useRef<HTMLDivElement>(null);

  const { setPageContext } = useChatContext();
  const { data: book, isLoading: bookLoading, error: bookError } = useBook(bookId);
  const { data: chapters, isLoading: chaptersLoading } = useChapters(bookId);
  const { data: chunks, isLoading: chunksLoading } = useChunks(bookId, viewingChapterId);

  useEffect(() => {
    setPageContext({ page: 'reader', bookId, bookTitle: book?.title });
  }, [bookId, book?.title, setPageContext]);

  useEffect(() => {
    const chapter = chapters?.find((c) => c.id === viewingChapterId);
    setPageContext({
      chapterId: viewingChapterId ?? undefined,
      chapterTitle: chapter?.title,
      chapterNumber: chapter?.order,
    });
  }, [viewingChapterId, chapters, setPageContext]);

  if (bookLoading || chaptersLoading) return <LoadingSpinner />;
  if (bookError) return <ErrorMessage message={bookError.message} />;
  if (!book) return <ErrorMessage message="Book not found" />;

  const chapterList = chapters ?? [];
  const selectedChapterIdx = chapterList.findIndex((c) => c.id === expandedChapterId);
  const viewingChapter = chapterList.find((c) => c.id === viewingChapterId);
  const viewingChapterOrder = viewingChapter?.order ?? null;

  const handleSelectChapter = (chapterId: string) => {
    setExpandedChapterId(chapterId);
    setSelectedChapterId(chapterId);
    setViewingChapterId(chapterId);
  };


  return (
    <div className="flex h-full relative">
      <BezierConnectors
        col1Ref={col1Ref}
        col2Ref={col2Ref}
        col3Ref={col3Ref}
        selectedChapterIdx={selectedChapterIdx}
        chapterCount={chapterList.length}
        chunkCount={chunks?.length ?? 0}
        showCol3={!!viewingChapterId}
      />

      {/* Column 1: Book Overview */}
      <div
        ref={col1Ref}
        className="flex-shrink-0 overflow-y-auto"
        style={{
          width: 200,
          borderRight: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <BookOverview book={book} />
      </div>

      {/* Spacer between col1 and col2 — gives Bezier curves breathing room */}
      <div className="flex-shrink-0" style={{ width: 28 }} />

      {/* Column 2: Chapter List */}
      <div
        ref={col2Ref}
        className="flex-shrink-0 overflow-y-auto p-2 space-y-1"
        style={{
          width: 220,
          borderRight: '1px solid var(--border)',
        }}
      >
        {chapterList.map((chapter) => (
          <div key={chapter.id} data-chapter-card>
            <ChapterCard
              chapter={chapter}
              isSelected={selectedChapterId === chapter.id}
              isExpanded={expandedChapterId === chapter.id}
              onSelect={() => handleSelectChapter(chapter.id)}
            />
          </div>
        ))}
      </div>

      {/* Spacer between col2 and col3 — gives Bezier curves breathing room */}
      <div className="flex-shrink-0" style={{ width: 28 }} />

      {/* Column 3: Chunk Content */}
      <div
        ref={col3Ref}
        className="flex-1 overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {viewingChapterId ? (
          <div className="p-4">
            {/* Header with epistemic toggle */}
            <div
              className="sticky top-0 z-10 pb-2 mb-3 flex items-start justify-between"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div>
                <h3
                  className="text-sm font-semibold"
                  style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
                >
                  {viewingChapter?.title}
                </h3>
                <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                  {chunks?.length ?? 0} chunks
                </span>
              </div>
              <button
                onClick={() => setEpistemicOpen((v) => !v)}
                title="認識論狀態"
                className="p-1.5 rounded hover:opacity-70 flex-shrink-0"
                style={{
                  backgroundColor: epistemicOpen ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: epistemicOpen ? 'white' : 'var(--fg-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                <Brain size={14} />
              </button>
            </div>

            {chunksLoading && <LoadingSpinner />}
            {!chunksLoading && chunks?.map((chunk) => <ChunkCard key={chunk.id} chunk={chunk} />)}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              {t('selectChapter')}
            </p>
          </div>
        )}
      </div>

      {/* Column 4: Epistemic Side Panel */}
      {bookId && (
        <div
          className="flex-shrink-0 overflow-hidden"
          style={{
            width: epistemicOpen ? 280 : 0,
            transition: 'width 200ms ease',
          }}
        >
          {epistemicOpen && (
            <EpistemicSidePanel
              bookId={bookId}
              chapters={chapterList}
              currentChapterOrder={viewingChapterOrder}
              onClose={() => setEpistemicOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
