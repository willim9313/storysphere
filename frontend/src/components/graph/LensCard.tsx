import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Pin, Settings, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { detectTimeline, fetchTimelineConfig } from '@/api/graph';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { TimelineConfigModal } from './TimelineConfigModal';
import type { GraphNode } from '@/api/types';
import type { TimelineDetectionResponse } from '@/api/graph';

export interface TimelineState {
  mode: 'chapter' | 'story';
  position: number;
}

interface LensCardProps {
  bookId: string;
  nodes: GraphNode[];
  bookmarkedIds: string[];
  onBookmarkRemove: (id: string) => void;
  onBookmarkClick?: (id: string) => void;
  onTimelineChange: (state: TimelineState | null) => void;
  onUnknownEntityIds: (ids: Set<string>) => void;
}

export function LensCard({
  bookId,
  nodes,
  bookmarkedIds,
  onBookmarkRemove,
  onBookmarkClick,
  onTimelineChange,
  onUnknownEntityIds,
}: LensCardProps) {
  const { t } = useTranslation('graph');
  const queryClient = useQueryClient();

  // ── Timeline state (preserves legacy localStorage keys) ───────────
  const [tlMode, setTlMode] = useLocalStorage<'chapter' | 'story'>(
    `graph:${bookId}:timeline:mode`,
    'chapter',
  );
  const [tlPosition, setTlPosition] = useLocalStorage(`graph:${bookId}:timeline:position`, 0);
  const [tlEnabled, setTlEnabled] = useLocalStorage(`graph:${bookId}:timeline:enabled`, false);
  const [pendingDetection, setPendingDetection] = useState<TimelineDetectionResponse | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: config } = useQuery({
    queryKey: ['books', bookId, 'timeline-config'],
    queryFn: () => fetchTimelineConfig(bookId),
  });

  const detectMutation = useMutation({
    mutationFn: () => detectTimeline(bookId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['books', bookId, 'timeline-config'] });
      setPendingDetection(data);
    },
  });

  const chapterMax = config?.totalChapters ?? 0;
  const storyMax = config?.totalRankedEvents ?? 0;
  const chapterAvailable = (config?.chapterModeEnabled ?? false) && chapterMax > 0;
  const storyAvailable = (config?.storyModeEnabled ?? false) && storyMax > 0;
  const anyTimelineAvailable = chapterAvailable || storyAvailable;
  const currentMax = tlMode === 'chapter' ? chapterMax : storyMax;

  // Position 0 = "all" / disabled; >=1 = snapshot up to N
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const enabled = tlPosition > 0;
    if (tlEnabled !== enabled) setTlEnabled(enabled);
    if (!enabled) {
      onTimelineChange(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      onTimelineChange({ mode: tlMode, position: tlPosition });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [tlMode, tlPosition, tlEnabled, setTlEnabled, onTimelineChange]);

  // ── Epistemic state ───────────────────────────────────────────────
  const [epCharacterId, setEpCharacterId] = useLocalStorage<string | null>(
    `graph:${bookId}:epistemic:characterId`,
    null,
  );
  const [epEnabled, setEpEnabled] = useLocalStorage(`graph:${bookId}:epistemic:enabled`, false);
  const [epPickerOpen, setEpPickerOpen] = useState(false);

  const characterNodes = useMemo(
    () => nodes.filter((n) => n.type === 'character'),
    [nodes],
  );

  const epistemicChapter = tlMode === 'chapter' && tlPosition > 0 ? tlPosition : 1;
  const epActive = epEnabled && !!epCharacterId;
  const { data: epistemicState } = useEpistemicState(
    epActive ? bookId : undefined,
    epActive ? epCharacterId : null,
    epActive ? epistemicChapter : null,
  );

  const unknownEntityIds = useMemo(() => {
    if (!epActive || !epistemicState) return new Set<string>();
    const known = new Set<string>(
      epistemicState.knownEvents.flatMap((e: Record<string, unknown>) =>
        Array.isArray(e.participants) ? (e.participants as string[]) : [],
      ),
    );
    const unknown = new Set<string>(
      epistemicState.unknownEvents.flatMap((e: Record<string, unknown>) =>
        Array.isArray(e.participants) ? (e.participants as string[]) : [],
      ),
    );
    const ids = new Set<string>();
    for (const id of unknown) if (!known.has(id)) ids.add(id);
    return ids;
  }, [epActive, epistemicState]);

  useEffect(() => {
    onUnknownEntityIds(unknownEntityIds);
  }, [unknownEntityIds, onUnknownEntityIds]);

  const selectedCharacter = useMemo(
    () => characterNodes.find((n) => n.id === epCharacterId) ?? null,
    [characterNodes, epCharacterId],
  );

  const handleSelectCharacter = (id: string | null) => {
    setEpCharacterId(id);
    setEpEnabled(id != null);
    setEpPickerOpen(false);
    if (id == null) onUnknownEntityIds(new Set());
  };

  // ── Bookmarks ─────────────────────────────────────────────────────
  const bookmarkNodes = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n]));
    return bookmarkedIds.map((id) => map.get(id)).filter((n): n is GraphNode => !!n);
  }, [nodes, bookmarkedIds]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      className="absolute bottom-4 left-4 z-10"
      style={{
        width: 280,
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--fg-muted)', letterSpacing: '0.06em' }}
        >
          {t('v1.lens.title')}
        </span>
        {anyTimelineAvailable && (
          <button
            title={t('timeline.controls.reconfigure')}
            disabled={detectMutation.isPending}
            onClick={() => detectMutation.mutate()}
            style={{ color: 'var(--fg-muted)' }}
          >
            <Settings size={12} className={detectMutation.isPending ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Section 1 · Timeline */}
      {anyTimelineAvailable && (
        <section className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <SectionLabel>{t('v1.lens.timeline')}</SectionLabel>
          {chapterAvailable && storyAvailable && (
            <div className="flex gap-1 mb-2 mt-1.5">
              {(['chapter', 'story'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setTlMode(m);
                    setTlPosition(0);
                  }}
                  className="flex-1 text-[11px] py-1 rounded transition-colors"
                  style={{
                    backgroundColor: tlMode === m ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: tlMode === m ? 'var(--bg-primary)' : 'var(--fg-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {m === 'chapter' ? t('timeline.controls.modeReading') : t('timeline.controls.modeStory')}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-1">
            <input
              type="range"
              min={0}
              max={currentMax}
              value={Math.min(tlPosition, currentMax)}
              onChange={(e) => setTlPosition(Number(e.target.value))}
              className="flex-1 mr-3"
              style={{ accentColor: 'var(--accent)' }}
              aria-label={t('v1.lens.timeline')}
            />
            <span
              className="text-[11px] font-semibold tabular-nums whitespace-nowrap"
              style={{ color: 'var(--fg-primary)' }}
            >
              {tlPosition === 0
                ? t('v1.lens.allChapters')
                : t('v1.lens.chapter', { n: tlPosition, total: currentMax })}
            </span>
          </div>
        </section>
      )}

      {/* Section 2 · Epistemic */}
      <section className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionLabel>{t('v1.lens.epistemic')}</SectionLabel>
        <div className="flex items-center gap-2.5 mt-1.5 relative">
          <button
            onClick={() => setEpPickerOpen((v) => !v)}
            className="flex items-center gap-2.5 flex-1 text-left"
            aria-expanded={epPickerOpen}
          >
            <span
              className="inline-flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 24,
                height: 24,
                backgroundColor: selectedCharacter ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: selectedCharacter ? 'var(--bg-primary)' : 'var(--fg-muted)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {selectedCharacter ? selectedCharacter.name.charAt(0).toUpperCase() : '·'}
            </span>
            <span className="flex flex-col min-w-0">
              <span
                className="text-xs truncate"
                style={{
                  color: selectedCharacter ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  fontWeight: selectedCharacter ? 500 : 400,
                }}
              >
                {selectedCharacter
                  ? t('v1.lens.perspectiveOf', { name: selectedCharacter.name })
                  : t('v1.lens.selectPerspective')}
              </span>
              {selectedCharacter && (
                <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                  {t('v1.lens.perspectiveHint', { chapter: epistemicChapter })}
                </span>
              )}
            </span>
          </button>
          {selectedCharacter && (
            <button
              onClick={() => handleSelectCharacter(null)}
              style={{ color: 'var(--fg-muted)' }}
              aria-label={t('v1.lens.clearPerspective')}
            >
              <X size={12} />
            </button>
          )}
          {epPickerOpen && (
            <div
              className="absolute left-0 right-0 z-20 max-h-48 overflow-y-auto"
              style={{
                top: 32,
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md, 6px)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {characterNodes.length === 0 ? (
                <div className="px-2 py-2 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                  {t('v1.lens.noCharacters')}
                </div>
              ) : (
                characterNodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleSelectCharacter(n.id)}
                    className="w-full text-left px-2 py-1.5 text-xs"
                    style={{
                      backgroundColor:
                        n.id === epCharacterId ? 'var(--bg-secondary)' : 'transparent',
                      color: 'var(--fg-primary)',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        n.id === epCharacterId ? 'var(--bg-secondary)' : 'transparent')
                    }
                  >
                    {n.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {epActive && epistemicState && !epistemicState.dataComplete && (
          <div className="mt-2">
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
      </section>

      {/* Section 3 · Bookmarks */}
      <section className="px-4 py-3">
        <SectionLabel>{t('v1.lens.bookmarks')}</SectionLabel>
        {bookmarkNodes.length === 0 ? (
          <div className="flex items-center gap-2 mt-1.5">
            <Bookmark size={12} style={{ color: 'var(--fg-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              {t('v1.lens.noBookmarks')}
            </span>
          </div>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {bookmarkNodes.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <Pin size={11} style={{ color: 'var(--accent)' }} className="flex-shrink-0" />
                <button
                  onClick={() => onBookmarkClick?.(n.id)}
                  className="flex-1 text-left text-xs truncate"
                  style={{ color: 'var(--fg-primary)' }}
                >
                  {n.name}
                </button>
                <button
                  onClick={() => onBookmarkRemove(n.id)}
                  style={{ color: 'var(--fg-muted)' }}
                  aria-label={t('v1.lens.removeBookmark')}
                >
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingDetection && (
        <TimelineConfigModal
          bookId={bookId}
          detection={pendingDetection}
          onClose={() => setPendingDetection(null)}
        />
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase"
      style={{ color: 'var(--fg-muted)', letterSpacing: '0.06em' }}
    >
      {children}
    </div>
  );
}
