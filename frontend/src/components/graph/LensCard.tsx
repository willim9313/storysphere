import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Clock, Eye, Pause, Pin, Play, Settings, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { detectTimeline, fetchTimelineConfig } from '@/api/graph';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { TimelineConfigModal } from './TimelineConfigModal';
import { resolveEpistemicChapter, stepTimelinePlayback } from '@/lib/graphLens';
import type { ClusterMode } from './GraphToolbar';
import type { GraphNode } from '@/api/types';
import type { TimelineDetectionResponse } from '@/api/graph';

export interface TimelineState {
  mode: 'chapter' | 'story';
  position: number;
}

type LensTab = 'timeline' | 'epistemic' | 'bookmarks';

const PLAYBACK_INTERVAL_MS = 900;

interface LensCardProps {
  bookId: string;
  nodes: GraphNode[];
  bookmarkedIds: string[];
  onBookmarkRemove: (id: string) => void;
  onBookmarkClick?: (id: string) => void;
  onTimelineChange: (state: TimelineState | null) => void;
  onUnknownEntityIds: (ids: Set<string>) => void;
  onMisbeliefEventIds: (ids: Set<string>) => void;
  /** Book's total chapter count (from GraphPage's chapters query) — used for
   * the epistemic fallback (brief §9-5): "all chapters" or story mode fall
   * back to the final chapter instead of chapter 1. */
  totalChapters: number;
  clusterMode: ClusterMode;
  onBackToIndividual: () => void;
  /** F4 deep-link (?chapter=N): seeds the timeline to this chapter on first
   * mount only — afterwards normal localStorage-backed behavior resumes. */
  deepLinkChapter?: number;
}

export function LensCard({
  bookId,
  nodes,
  bookmarkedIds,
  onBookmarkRemove,
  onBookmarkClick,
  onTimelineChange,
  onUnknownEntityIds,
  onMisbeliefEventIds,
  totalChapters,
  clusterMode,
  onBackToIndividual,
  deepLinkChapter,
}: LensCardProps) {
  const { t } = useTranslation('graph');
  const queryClient = useQueryClient();

  const [lensTab, setLensTab] = useState<LensTab>('timeline');

  // ── Timeline state (preserves legacy localStorage keys) ───────────
  const [tlMode, setTlMode] = useLocalStorage<'chapter' | 'story'>(
    `graph:${bookId}:timeline:mode`,
    'chapter',
  );
  const [tlPosition, setTlPosition] = useLocalStorage(`graph:${bookId}:timeline:position`, 0);
  const [tlEnabled, setTlEnabled] = useLocalStorage(`graph:${bookId}:timeline:enabled`, false);
  const [pendingDetection, setPendingDetection] = useState<TimelineDetectionResponse | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // F4 deep-link: seed the timeline from ?chapter=N on first mount only —
  // afterwards normal localStorage-backed tlMode/tlPosition behavior resumes.
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    deepLinkAppliedRef.current = true;
    if (deepLinkChapter != null && deepLinkChapter > 0) {
      setTlMode('chapter');
      setTlPosition(deepLinkChapter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount effect, guarded by deepLinkAppliedRef
  }, []);

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
  const chapterAvailable = chapterMax > 0;
  // C3 / brief §9-6: story mode is gated on viability (backend:
  // story_mode_viable = ranked_event_count > 0), independent of whether the
  // user has separately flipped `storyModeEnabled` on via the config modal.
  const storyViable = storyMax > 0;
  const anyTimelineAvailable = chapterAvailable || storyViable;
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

  // ── F3 逐章成長播放 ──────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlayback = () => {
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    setPlaying(false);
  };

  useEffect(() => stopPlayback, []);

  const handleTogglePlay = () => {
    if (playing) {
      stopPlayback();
      return;
    }
    if (currentMax <= 0) return;
    setPlaying(true);
    playTimerRef.current = setInterval(() => {
      setTlPosition((prev) => {
        const { next, done } = stepTimelinePlayback(prev, currentMax);
        if (done) stopPlayback();
        return next;
      });
    }, PLAYBACK_INTERVAL_MS);
  };

  // ── Epistemic state ───────────────────────────────────────────────
  const [epCharacterId, setEpCharacterId] = useLocalStorage<string | null>(
    `graph:${bookId}:epistemic:characterId`,
    null,
  );
  const [epEnabled, setEpEnabled] = useLocalStorage(`graph:${bookId}:epistemic:enabled`, false);
  const [epMisbelief, setEpMisbelief] = useLocalStorage(`graph:${bookId}:epistemic:misbelief`, false);
  const [epPickerOpen, setEpPickerOpen] = useState(false);

  const characterNodes = useMemo(
    () => nodes.filter((n) => n.type === 'character'),
    [nodes],
  );

  const epistemicChapter = resolveEpistemicChapter(tlMode, tlPosition, totalChapters);
  // Lens × 群集模式 policy: epistemic perspective only applies to the
  // individual view (brief §2.1) — aggregate views have no single focal
  // character to hang it off. Settings stay intact; they just don't drive
  // the canvas while in type/community mode.
  const epActive = clusterMode === 'node' && epEnabled && !!epCharacterId;
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

  // Misbelief markers: `sourceEventId` on each misbelief item is the id of
  // the event node the false belief traces back to (backend confirmed —
  // Event.id is reused verbatim as the graph node id for event-type nodes),
  // so it maps straight onto a graph node without any extra lookup.
  const misbeliefEventIds = useMemo(() => {
    if (!epActive || !epMisbelief || !epistemicState) return new Set<string>();
    return new Set(epistemicState.misbeliefs.map((m) => m.sourceEventId));
  }, [epActive, epMisbelief, epistemicState]);

  useEffect(() => {
    onMisbeliefEventIds(misbeliefEventIds);
  }, [misbeliefEventIds, onMisbeliefEventIds]);

  const selectedCharacter = useMemo(
    () => characterNodes.find((n) => n.id === epCharacterId) ?? null,
    [characterNodes, epCharacterId],
  );

  const handleSelectCharacter = (id: string | null) => {
    setEpCharacterId(id);
    setEpPickerOpen(false);
    if (id == null) {
      setEpEnabled(false);
      onUnknownEntityIds(new Set());
      onMisbeliefEventIds(new Set());
    } else {
      setEpEnabled(true);
    }
  };

  const epKnownCount = nodes.length - unknownEntityIds.size;
  const epUsingFallback = !(tlMode === 'chapter' && tlPosition > 0);
  const epFallbackNote = epUsingFallback
    ? t('v1.lens.epistemicFallbackAll')
    : t('v1.lens.epistemicFallbackChapter', { n: tlPosition });

  // ── Bookmarks ─────────────────────────────────────────────────────
  const bookmarkNodes = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n]));
    return bookmarkedIds.map((id) => map.get(id)).filter((n): n is GraphNode => !!n);
  }, [nodes, bookmarkedIds]);

  const isAggregateMode = clusterMode !== 'node';

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      className="absolute bottom-4 left-4 z-10 overflow-hidden"
      style={{
        width: 320,
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        fontSize: 'var(--font-size-sm)',
      }}
    >
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
        <LensTabButton
          active={lensTab === 'timeline'}
          icon={<Clock size={12} />}
          label={t('v1.lens.tabTimeline')}
          onClick={() => setLensTab('timeline')}
        />
        <LensTabButton
          active={lensTab === 'epistemic'}
          icon={<Eye size={12} />}
          label={t('v1.lens.tabEpistemic')}
          onClick={() => setLensTab('epistemic')}
        />
        <LensTabButton
          active={lensTab === 'bookmarks'}
          icon={<Bookmark size={12} />}
          label={t('v1.lens.tabBookmarks')}
          onClick={() => setLensTab('bookmarks')}
        />
      </div>

      <div className="px-4 py-3">
        {/* ── Timeline tab ─────────────────────────────────────────── */}
        {lensTab === 'timeline' && anyTimelineAvailable && (
          <>
            <div className="flex items-center justify-between mb-1.5">
              {chapterAvailable ? (
                <div className="flex gap-1">
                  {(['chapter', 'story'] as const).map((m) => {
                    const disabled = m === 'story' && !storyViable;
                    const isActive = tlMode === m;
                    return (
                      <button
                        key={m}
                        disabled={disabled}
                        title={disabled ? t('v1.lens.storyModeLocked') : undefined}
                        onClick={() => {
                          if (disabled) return;
                          setTlMode(m);
                          setTlPosition(0);
                        }}
                        className="text-[11px] py-1 px-2 rounded transition-colors"
                        style={{
                          backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-secondary)',
                          color: isActive ? 'var(--bg-primary)' : 'var(--fg-secondary)',
                          border: '1px solid var(--border)',
                          opacity: disabled ? 0.45 : 1,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {m === 'chapter' ? t('timeline.controls.modeReading') : t('timeline.controls.modeStory')}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span />
              )}
              <button
                title={t('timeline.controls.reconfigure')}
                disabled={detectMutation.isPending}
                onClick={() => detectMutation.mutate()}
                style={{ color: 'var(--fg-muted)' }}
              >
                <Settings size={12} className={detectMutation.isPending ? 'animate-spin' : ''} />
              </button>
            </div>

            <div
              className="font-bold mb-1.5"
              style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-size-sm)', color: 'var(--fg-primary)' }}
            >
              {tlPosition === 0
                ? t('v1.lens.allChapters')
                : t('v1.lens.chapter', { n: tlPosition, total: currentMax })}
            </div>
            <input
              type="range"
              min={0}
              max={currentMax}
              value={Math.min(tlPosition, currentMax)}
              onChange={(e) => setTlPosition(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: 'var(--accent)' }}
              aria-label={t('v1.lens.tabTimeline')}
            />
            <div className="flex justify-between text-[10px] mt-0.5" style={{ color: 'var(--fg-muted)' }}>
              <span>{t('v1.lens.allChapters')}</span>
              <span>{t('v1.lens.chapter', { n: currentMax, total: currentMax })}</span>
            </div>

            <button
              onClick={handleTogglePlay}
              disabled={currentMax <= 0}
              className="w-full flex items-center justify-center gap-1.5 mt-2.5 py-1.5 rounded"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--fg-primary)',
                fontSize: 'var(--font-size-2xs)',
                opacity: currentMax <= 0 ? 0.5 : 1,
                cursor: currentMax <= 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {playing ? t('v1.lens.playbackPause') : t('v1.lens.playbackStart')}
            </button>

            <p
              className="text-[11px] mt-2 pt-2"
              style={{ color: 'var(--fg-muted)', lineHeight: 1.55, borderTop: '1px solid var(--border)' }}
            >
              {t('v1.lens.timelineGlobalNote')}
            </p>
          </>
        )}
        {lensTab === 'timeline' && !anyTimelineAvailable && (
          <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            {t('v1.lens.noTimeline')}
          </p>
        )}

        {/* ── Epistemic tab ────────────────────────────────────────── */}
        {lensTab === 'epistemic' && isAggregateMode && (
          <div className="flex flex-col items-center text-center gap-2 py-1">
            <Eye size={20} style={{ color: 'var(--fg-muted)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--fg-primary)' }}>
              {t('v1.lens.epistemicDisabledTitle')}
            </div>
            <p className="text-[11.5px]" style={{ color: 'var(--fg-secondary)', lineHeight: 1.65 }}>
              {t('v1.lens.epistemicDisabledDesc')}
            </p>
            <button
              onClick={onBackToIndividual}
              className="mt-0.5 px-3 py-1.5 rounded text-[11px]"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--fg-primary)' }}
            >
              {t('v1.lens.backToIndividual')}
            </button>
          </div>
        )}

        {lensTab === 'epistemic' && !isAggregateMode && (
          <>
            <div className="text-xs mb-1.5" style={{ color: 'var(--fg-secondary)' }}>
              {t('v1.lens.epistemicIntro')}
            </div>
            <div className="flex items-center gap-2.5 relative">
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
                    fontSize: 'var(--font-size-2xs)',
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
                          backgroundColor: n.id === epCharacterId ? 'var(--bg-secondary)' : 'transparent',
                          color: 'var(--fg-primary)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
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
                    queryClient.invalidateQueries({ queryKey: ['books', bookId, 'epistemic-state'] })
                  }
                />
              </div>
            )}

            <label
              className="flex items-center gap-2 mt-2.5 py-1"
              style={{ opacity: epCharacterId ? 1 : 0.5, cursor: epCharacterId ? 'pointer' : 'not-allowed' }}
            >
              <input
                type="checkbox"
                checked={epEnabled && !!epCharacterId}
                disabled={!epCharacterId}
                onChange={() => setEpEnabled((v) => !v)}
              />
              <span className="flex flex-col">
                <span className="text-xs" style={{ color: 'var(--fg-primary)' }}>
                  {t('v1.lens.epistemicToggleLabel')}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                  {t('v1.lens.epistemicToggleDesc')}
                </span>
              </span>
            </label>

            {epActive && (
              <>
                <div
                  className="mt-1.5 px-3 py-2 rounded"
                  style={{ backgroundColor: 'var(--bg-secondary)', textAlign: 'center' }}
                >
                  <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--fg-primary)' }}>
                    {epKnownCount}
                    <span className="text-[13px] font-normal" style={{ color: 'var(--fg-muted)' }}>
                      {' / '}
                      {nodes.length}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                    {t('v1.lens.epistemicKnownStat', { name: selectedCharacter?.name ?? '' })}
                  </div>
                </div>

                <div
                  className="flex gap-1.5 items-start mt-2 p-1.5 rounded text-[11px]"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-secondary)', lineHeight: 1.55 }}
                >
                  <Clock size={11} style={{ marginTop: 2, color: 'var(--fg-muted)', flexShrink: 0 }} />
                  <span>{epFallbackNote}</span>
                </div>

                <label className="flex items-center gap-2 mt-2 py-1" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={epMisbelief}
                    onChange={() => setEpMisbelief((v) => !v)}
                  />
                  <span className="flex flex-col">
                    <span className="text-xs" style={{ color: 'var(--fg-primary)' }}>
                      {t('v1.lens.misbeliefToggle')}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                      {t('v1.lens.misbeliefToggleDesc')}
                    </span>
                  </span>
                </label>
              </>
            )}
          </>
        )}

        {/* ── Bookmarks tab ────────────────────────────────────────── */}
        {lensTab === 'bookmarks' && (
          <div className="flex flex-col gap-1.5">
            {bookmarkNodes.length === 0 ? (
              <div className="flex items-center gap-2">
                <Bookmark size={12} style={{ color: 'var(--fg-muted)' }} />
                <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                  {t('v1.lens.noBookmarks')}
                </span>
              </div>
            ) : (
              <ul className="space-y-1">
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
            {isAggregateMode && (
              <p
                className="text-[11px] p-1.5 rounded"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--fg-secondary)', lineHeight: 1.55 }}
              >
                {t('v1.lens.bookmarkAggregateNote')}
              </p>
            )}
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--fg-muted)' }}>
              {t('v1.lens.bookmarkStorageNote')}
            </div>
          </div>
        )}
      </div>

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

function LensTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2"
      style={{
        fontSize: 'var(--font-size-2xs)',
        fontWeight: 500,
        color: active ? 'var(--accent)' : 'var(--fg-secondary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        marginBottom: -1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
