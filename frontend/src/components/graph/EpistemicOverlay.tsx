import { useState, useMemo, useEffect } from 'react';
import { Eye, EyeOff, ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useQueryClient } from '@tanstack/react-query';
import type { GraphNode } from '@/api/types';

interface EpistemicOverlayProps {
  bookId: string;
  nodes: GraphNode[];
  timelineChapter: number | null;
  onUnknownEntityIds: (ids: Set<string>) => void;
}

export function EpistemicOverlay({
  bookId,
  nodes,
  timelineChapter,
  onUnknownEntityIds,
}: EpistemicOverlayProps) {
  const [expanded, setExpanded] = useLocalStorage(`graph:${bookId}:epistemic:expanded`, false);
  const [enabled, setEnabled] = useLocalStorage(`graph:${bookId}:epistemic:enabled`, false);
  const [selectedCharacterId, setSelectedCharacterId] = useLocalStorage<string | null>(
    `graph:${bookId}:epistemic:characterId`,
    null,
  );
  const queryClient = useQueryClient();

  const characterNodes = useMemo(
    () => nodes.filter((n) => n.type === 'character'),
    [nodes],
  );

  const chapter = timelineChapter ?? 1;

  const { data: epistemicState, isFetching } = useEpistemicState(
    enabled && selectedCharacterId ? bookId : undefined,
    selectedCharacterId,
    chapter,
  );

  // Derive unknown entity IDs
  const unknownEntityIds = useMemo(() => {
    if (!enabled || !epistemicState) return new Set<string>();

    const knownParticipants = new Set<string>(
      epistemicState.knownEvents.flatMap((e: Record<string, unknown>) =>
        Array.isArray(e.participants) ? (e.participants as string[]) : [],
      ),
    );
    const unknownParticipants = new Set<string>(
      epistemicState.unknownEvents.flatMap((e: Record<string, unknown>) =>
        Array.isArray(e.participants) ? (e.participants as string[]) : [],
      ),
    );
    // Only dim entities that appear ONLY in unknown events (never in known)
    const ids = new Set<string>();
    for (const id of unknownParticipants) {
      if (!knownParticipants.has(id)) ids.add(id);
    }
    return ids;
  }, [enabled, epistemicState]);

  // Propagate unknown entity IDs to parent — useEffect, not useMemo, to avoid side-effects in render
  useEffect(() => {
    onUnknownEntityIds(unknownEntityIds);
  }, [unknownEntityIds, onUnknownEntityIds]);

  const knownCount = epistemicState?.knownEvents.length ?? 0;
  const unknownCount = epistemicState?.unknownEvents.length ?? 0;

  return (
    <div
      className="absolute left-4 z-10"
      style={{
        bottom: '216px',
        minWidth: 220,
        backgroundColor: 'white',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <Brain size={14} style={{ color: 'var(--fg-muted)' }} />
        <span className="flex-1 font-medium" style={{ color: 'var(--fg-primary)' }}>
          角色視角
        </span>
        {enabled && selectedCharacterId && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--bg-accent)', color: 'var(--fg-muted)' }}
          >
            {knownCount}已知 / {unknownCount}未知
          </span>
        )}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2 border-t" style={{ borderColor: 'var(--border)' }}>
          {/* Enable toggle */}
          <div className="flex items-center justify-between pt-2">
            <span style={{ color: 'var(--fg-secondary)' }}>啟用</span>
            <button
              onClick={() => {
                setEnabled((v) => !v);
                if (enabled) onUnknownEntityIds(new Set());
              }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: enabled ? 'var(--accent)' : 'var(--bg-secondary)',
                color: enabled ? 'white' : 'var(--fg-muted)',
              }}
            >
              {enabled ? <Eye size={12} /> : <EyeOff size={12} />}
              {enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Character selector */}
          {enabled && (
            <div className="flex flex-col gap-1">
              <span style={{ color: 'var(--fg-secondary)' }}>選擇角色</span>
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
                {characterNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
              {isFetching && (
                <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                  計算中…
                </span>
              )}
              {epistemicState && !epistemicState.dataComplete && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--warning)' }}>
                    ⚠ 尚無 visibility 資料
                  </span>
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
          )}
        </div>
      )}
    </div>
  );
}
