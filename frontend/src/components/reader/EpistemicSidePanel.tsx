import { useState, useMemo } from 'react';
import { X, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { useQueryClient } from '@tanstack/react-query';
import type { Chapter } from '@/api/types';

interface EpistemicSidePanelProps {
  bookId: string;
  chapters: Chapter[];
  currentChapterOrder: number | null;
  onClose: () => void;
}

export function EpistemicSidePanel({
  bookId,
  chapters,
  currentChapterOrder,
  onClose,
}: EpistemicSidePanelProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Collect all characters from top-entities across all chapters up to current
  const characterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    const upTo = currentChapterOrder ?? 1;
    for (const ch of chapters) {
      if (ch.order > upTo) break;
      for (const e of ch.topEntities ?? []) {
        if (e.type === 'character' && !seen.has(e.id)) {
          seen.set(e.id, e.name);
        }
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [chapters, currentChapterOrder]);

  const { data: state, isFetching } = useEpistemicState(
    bookId,
    selectedCharacterId,
    currentChapterOrder,
  );

  return (
    <div
      className="h-full flex flex-col"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>
          認識論狀態
        </span>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70">
          <X size={14} />
        </button>
      </div>

      {/* Character selector */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <select
          className="w-full text-xs rounded px-2 py-1"
          style={{
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--fg-primary)',
          }}
          value={selectedCharacterId ?? ''}
          onChange={(e) => setSelectedCharacterId(e.target.value || null)}
        >
          <option value="">-- 選擇角色 --</option>
          {characterOptions.map(({ id, name }) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {isFetching && (
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>計算中…</p>
        )}
        {state && !state.dataComplete && (
          <div className="mt-1 flex flex-col gap-1">
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
              <AlertTriangle size={11} /> 尚無 visibility 資料
            </p>
            <ClassifyVisibilityButton
              bookId={bookId}
              onComplete={() =>
                queryClient.invalidateQueries({
                  queryKey: ['books', bookId, 'epistemic-state'],
                })
              }
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-4">
        {!selectedCharacterId && (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>請選擇角色以查看認識論狀態</p>
        )}

        {state && selectedCharacterId && (
          <>
            {/* Known events */}
            <section>
              <h4 className="text-xs font-semibold mb-1" style={{ color: 'var(--color-success)' }}>
                <Eye size={11} className="inline mr-1" />
                已知事件（{state.knownEvents.length}）
              </h4>
              {state.knownEvents.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>（無）</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {(state.knownEvents as Record<string, unknown>[]).map((ev, i) => (
                    <li
                      key={String(ev.id ?? i)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}
                    >
                      <span className="font-medium">{String(ev.title ?? '')}</span>
                      <span className="ml-1 opacity-60">Ch.{String(ev.chapter ?? '')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Unknown events */}
            <section>
              <h4 className="text-xs font-semibold mb-1" style={{ color: 'var(--color-warning)' }}>
                <EyeOff size={11} className="inline mr-1" />
                未知事件（{state.unknownEvents.length}）
              </h4>
              {state.unknownEvents.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>（無）</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {(state.unknownEvents as Record<string, unknown>[]).map((ev, i) => (
                    <li
                      key={String(ev.id ?? i)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
                    >
                      <span className="font-medium">{String(ev.title ?? '')}</span>
                      <span className="ml-1 opacity-60">Ch.{String(ev.chapter ?? '')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Misbeliefs */}
            {state.misbeliefs.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold mb-1" style={{ color: 'var(--color-error)' }}>
                  <AlertTriangle size={11} className="inline mr-1" />
                  誤信（{state.misbeliefs.length}）
                </h4>
                <ul className="flex flex-col gap-2">
                  {state.misbeliefs.map((m) => (
                    <li
                      key={m.sourceEventId}
                      className="text-xs px-2 py-1.5 rounded"
                      style={{ border: '1px solid var(--color-error)', backgroundColor: 'var(--color-error-bg)' }}
                    >
                      <p style={{ color: 'var(--color-error)' }}>
                        <span className="font-medium">誤信：</span>{m.characterBelief}
                      </p>
                      <p className="mt-0.5" style={{ color: 'var(--fg-muted)' }}>
                        <span className="font-medium">實情：</span>{m.actualTruth}
                      </p>
                      <p className="mt-0.5 opacity-50">信心度 {Math.round(m.confidence * 100)}%</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
