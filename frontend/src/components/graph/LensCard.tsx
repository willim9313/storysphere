import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, ChevronDown, Pause, Play, Settings, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { detectTimeline, fetchTimelineConfig } from '@/api/graph';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useEpistemicState } from '@/hooks/useEpistemicState';
import { ClassifyVisibilityButton } from '@/components/epistemic/ClassifyVisibilityButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { TimelineConfigModal } from './TimelineConfigModal';
import { resolveEpistemicChapter, stepTimelinePlayback } from '@/lib/graphLens';
import type { ClusterMode } from './GraphToolbar';
import type { GraphNode } from '@/api/types';
import type { TimelineDetectionResponse } from '@/api/graph';
import { qk } from '@/api/queryKeys';

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
  // 收合態（稿的 landing 狀態）；刻意不寫 localStorage。
  const [collapsed, setCollapsed] = useState(true);

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
    queryKey: qk.timeline.config(bookId),
    queryFn: () => fetchTimelineConfig(bookId),
  });

  const detectMutation = useMutation({
    mutationFn: () => detectTimeline(bookId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: qk.timeline.config(bookId) });
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
  // 14 提案 A/F：收合態 272、展開態 296。收合狀態只活在本次工作階段（稿與 README 沒有規定要記憶）。
  const shownTab: LensTab = collapsed ? 'timeline' : lensTab;
  const pickTab = (tab: LensTab) => {
    setLensTab(tab);
    setCollapsed(false);
  };

  const positionLabel =
    tlPosition === 0
      ? t('v1.lens.allChapters')
      : t('v1.lens.chapter', { n: tlPosition, total: currentMax });

  const modeSeg = chapterAvailable ? (
    <div className="ss-seg kg-lens-seg" role="group">
      {(['chapter', 'story'] as const).map((m) => {
        const disabled = m === 'story' && !storyViable;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            aria-pressed={tlMode === m}
            onClick={() => {
              setTlMode(m);
              setTlPosition(0);
            }}
            className={tlMode === m ? 'ss-seg-item active' : 'ss-seg-item'}
          >
            {m === 'chapter' ? t('timeline.controls.modeReading') : t('timeline.controls.modeStory')}
          </button>
        );
      })}
    </div>
  ) : (
    <span />
  );

  const slider = (
    <div className="kg-lens-slider">
      <input
        type="range"
        min={0}
        max={currentMax}
        value={Math.min(tlPosition, currentMax)}
        onChange={(e) => setTlPosition(Number(e.target.value))}
        aria-label={t('v1.lens.tabTimeline')}
      />
      <span className="kg-lens-slider-label">{positionLabel}</span>
    </div>
  );

  const playButton = (cls: string) => (
    <button type="button" onClick={handleTogglePlay} disabled={currentMax <= 0} className={cls}>
      {playing ? <Pause size={12} /> : <Play size={12} />}
      {playing ? t('v1.lens.playbackPause') : t('v1.lens.playbackStart')}
    </button>
  );

  return (
    <div className={collapsed ? 'kg-lens is-collapsed' : 'kg-lens'}>
      {/* Tab bar（純文字分頁＋收合 chevron） */}
      <div className="kg-lens-tabs">
        {(
          [
            ['timeline', 'v1.lens.tabTimeline'],
            ['epistemic', 'v1.lens.tabEpistemic'],
            ['bookmarks', 'v1.lens.tabBookmarks'],
          ] as const
        ).map(([tab, key]) => (
          <button
            key={tab}
            type="button"
            onClick={() => pickTab(tab)}
            className={shownTab === tab ? 'kg-lens-tab is-active' : 'kg-lens-tab'}
          >
            {t(key)}
          </button>
        ))}
        <span className="kg-lens-tabs-spacer" />
        <button
          type="button"
          className="kg-lens-collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('v1.lens.expand') : t('v1.lens.collapse')}
          onClick={() => setCollapsed((v) => !v)}
        >
          <ChevronDown size={13} className={collapsed ? undefined : 'is-flipped'} />
        </button>
      </div>

      {/* ── 收合態：分頁 + 閱讀/故事 + 細滑桿 + 全域註記 ───────────────── */}
      {collapsed &&
        (anyTimelineAvailable ? (
          <>
            <div className="kg-lens-row">
              {modeSeg}
              <span className="kg-lens-tabs-spacer" />
              {playButton('kg-lens-play-hint')}
            </div>
            {slider}
            <p className="kg-lens-note">{t('v1.lens.timelineGlobalNote')}</p>
          </>
        ) : (
          <p className="kg-lens-note">{t('v1.lens.noTimeline')}</p>
        ))}

      {/* ── Timeline tab ─────────────────────────────────────────── */}
      {!collapsed && lensTab === 'timeline' && anyTimelineAvailable && (
        <>
          <div className="kg-lens-row">
            {modeSeg}
            <span className="kg-lens-tabs-spacer" />
            <Tooltip label={t('timeline.controls.reconfigure')}>
              <button
                type="button"
                className="kg-lens-gear"
                aria-label={t('timeline.controls.reconfigure')}
                disabled={detectMutation.isPending}
                onClick={() => detectMutation.mutate()}
              >
                <Settings size={14} className={detectMutation.isPending ? 'animate-spin' : ''} />
              </button>
            </Tooltip>
          </div>
          {chapterAvailable && !storyViable && (
            <p className="kg-lens-locked">{t('v1.lens.storyModeLocked')}</p>
          )}
          {slider}
          {playButton('ss-btn ss-btn-sm ss-btn-secondary kg-lens-play')}
          <p className="kg-lens-note">{t('v1.lens.timelineGlobalNote')}</p>
        </>
      )}
      {!collapsed && lensTab === 'timeline' && !anyTimelineAvailable && (
        <p className="kg-lens-note">{t('v1.lens.noTimeline')}</p>
      )}

      {/* ── Epistemic tab ────────────────────────────────────────── */}
      {!collapsed && lensTab === 'epistemic' && isAggregateMode && (
        <>
          <div className="kg-lens-aggregate">
            <span className="kg-label">{t('v1.lens.epistemicDisabledTitle')}</span>
            <p className="kg-text">{t('v1.lens.epistemicDisabledDesc')}</p>
            <button type="button" onClick={onBackToIndividual} className="ss-btn ss-btn-sm ss-btn-secondary">
              {t('v1.lens.backToIndividual')}
            </button>
          </div>
          <p className="kg-lens-note">{epFallbackNote}</p>
        </>
      )}

      {!collapsed && lensTab === 'epistemic' && !isAggregateMode && (
        <>
          <span className="kg-label">{t('v1.lens.epistemicIntro')}</span>
          <div className="kg-lens-select-wrap">
            <button
              type="button"
              onClick={() => setEpPickerOpen((v) => !v)}
              className="kg-lens-select"
              aria-expanded={epPickerOpen}
            >
              <span className={selectedCharacter ? 'kg-lens-select-text' : 'kg-lens-select-text is-placeholder'}>
                {selectedCharacter
                  ? t('v1.lens.perspectiveOf', { name: selectedCharacter.name })
                  : t('v1.lens.selectPerspective')}
              </span>
              <ChevronDown size={12} />
            </button>
            {selectedCharacter && (
              <button
                type="button"
                className="kg-lens-x"
                onClick={() => handleSelectCharacter(null)}
                aria-label={t('v1.lens.clearPerspective')}
              >
                <X size={12} />
              </button>
            )}
            {epPickerOpen && (
              <div className="kg-lens-menu">
                {characterNodes.length === 0 ? (
                  <div className="kg-lens-menu-empty">{t('v1.lens.noCharacters')}</div>
                ) : (
                  characterNodes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleSelectCharacter(n.id)}
                      className={n.id === epCharacterId ? 'kg-lens-menu-item is-on' : 'kg-lens-menu-item'}
                    >
                      {n.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <LensToggle
            checked={epEnabled && !!epCharacterId}
            disabled={!epCharacterId}
            onChange={() => setEpEnabled((v) => !v)}
            label={t('v1.lens.epistemicToggleLabel')}
            desc={t('v1.lens.epistemicToggleDesc')}
          />

          {epActive && (
            <>
              <LensToggle
                checked={epMisbelief}
                onChange={() => setEpMisbelief((v) => !v)}
                label={t('v1.lens.misbeliefToggle')}
                desc={t('v1.lens.misbeliefToggleDesc')}
              />
              <div className="kg-lens-stat">
                <span className="kg-lens-stat-key">
                  {t('v1.lens.epistemicKnownStat', { name: selectedCharacter?.name ?? '' })}
                </span>
                <span className="kg-lens-stat-val">
                  {epKnownCount} / {nodes.length}
                </span>
              </div>
              <p className="kg-lens-note kg-lens-note-secondary">{epFallbackNote}</p>
            </>
          )}

          {epActive && epistemicState && !epistemicState.dataComplete && (
            <div className="kg-lens-foot">
              <ClassifyVisibilityButton
                bookId={bookId}
                onComplete={() => queryClient.invalidateQueries({ queryKey: qk.epistemic.all(bookId) })}
              />
            </div>
          )}
        </>
      )}

      {/* ── Bookmarks tab ────────────────────────────────────────── */}
      {!collapsed && lensTab === 'bookmarks' && (
        <>
          {bookmarkNodes.length === 0 ? (
            <div className="kg-lens-empty">
              <Bookmark size={12} />
              <span>{t('v1.lens.noBookmarks')}</span>
            </div>
          ) : (
            <ul className="kg-lens-bookmarks">
              {bookmarkNodes.map((n) => (
                <li key={n.id} className="kg-lens-bookmark">
                  <button
                    type="button"
                    onClick={() => onBookmarkClick?.(n.id)}
                    className={`ss-pill ss-pill-${n.type} kg-lens-bookmark-pill`}
                  >
                    <span className="ss-pill-dot" />
                    <span className="kg-lens-bookmark-name">{n.name}</span>
                  </button>
                  <span className="kg-lens-tabs-spacer" />
                  <button
                    type="button"
                    className="kg-lens-x"
                    onClick={() => onBookmarkRemove(n.id)}
                    aria-label={t('v1.lens.removeBookmark')}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isAggregateMode && (
            <p className="kg-lens-note kg-lens-note-secondary">{t('v1.lens.bookmarkAggregateNote')}</p>
          )}
          <div className="kg-lens-foot kg-lens-note">{t('v1.lens.bookmarkStorageNote')}</div>
        </>
      )}

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

function LensToggle({
  checked,
  disabled,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="kg-lens-toggle"
    >
      <span className="kg-switch-track kg-lens-toggle-track">
        <span className="kg-switch-knob" />
      </span>
      <span className="kg-lens-toggle-text">
        <span className="kg-lens-toggle-label">{label}</span>
        <span className="kg-lens-toggle-desc">{desc}</span>
      </span>
    </button>
  );
}
