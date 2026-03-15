import { SegmentRenderer } from './SegmentRenderer';
import type { Chunk } from '@/api/types';

export function ChunkCard({ chunk }: { chunk: Chunk }) {
  return (
    <div
      className="rounded-lg p-4 mb-3"
      style={{
        backgroundColor: 'white',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          #{chunk.order}
        </span>
        {chunk.keywords.length > 0 && (
          <div className="flex gap-1">
            {chunk.keywords.slice(0, 3).map((kw) => (
              <span
                key={kw}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-muted)' }}
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
      <p
        className="text-sm leading-relaxed"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
      >
        <SegmentRenderer segments={chunk.segments} />
      </p>
    </div>
  );
}
