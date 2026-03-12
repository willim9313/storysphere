import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEntities } from '@/hooks/useEntities';
import { CharacterList } from '@/components/analysis/CharacterList';
import { CharacterAnalysisCard } from '@/components/analysis/CharacterAnalysisCard';
import { EventList } from '@/components/analysis/EventList';
import { EventAnalysisCard } from '@/components/analysis/EventAnalysisCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { EntityResponse } from '@/api/types';

type Tab = 'characters' | 'events';

export default function AnalysisPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [tab, setTab] = useState<Tab>('characters');
  const [selectedEntity, setSelectedEntity] = useState<EntityResponse | null>(null);

  const { data: entityData, isLoading, error } = useEntities({ limit: 500 });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  const entities = entityData?.items ?? [];
  const characters = entities.filter((e) => e.entity_type === 'character');
  const events = entities.filter((e) => e.entity_type === 'event');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-serif)' }}>
        Deep Analysis
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {(['characters', 'events'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSelectedEntity(null);
            }}
            className="px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px"
            style={{
              borderColor: tab === t ? 'var(--color-accent)' : 'transparent',
              color: tab === t ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            {t} ({t === 'characters' ? characters.length : events.length})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Entity list */}
        <div
          className="md:col-span-1 rounded-lg p-3 overflow-y-auto max-h-[600px]"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {tab === 'characters' ? (
            <CharacterList
              characters={characters}
              onSelect={setSelectedEntity}
              selectedId={selectedEntity?.id ?? null}
            />
          ) : (
            <EventList
              events={events}
              onSelect={setSelectedEntity}
              selectedId={selectedEntity?.id ?? null}
            />
          )}
        </div>

        {/* Analysis card */}
        <div className="md:col-span-2">
          {selectedEntity ? (
            tab === 'characters' ? (
              <CharacterAnalysisCard
                key={selectedEntity.id}
                entity={selectedEntity}
                documentId={bookId ?? ''}
              />
            ) : (
              <EventAnalysisCard
                key={selectedEntity.id}
                entity={selectedEntity}
                documentId={bookId ?? ''}
              />
            )
          ) : (
            <div
              className="flex items-center justify-center h-48 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Select a {tab === 'characters' ? 'character' : 'event'} to view or generate analysis.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
