import { useEffect, useRef, useState } from 'react';
import { BookOpen, Clock, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTimelineConfig, detectTimeline } from '@/api/graph';
import { TimelineConfigModal } from './TimelineConfigModal';
import type { TimelineDetectionResponse } from '@/api/graph';

export interface TimelineState {
  mode: 'chapter' | 'story';
  position: number;
}

interface TimelineControlsProps {
  bookId: string;
  onChange: (state: TimelineState | null) => void;
}

export function TimelineControls({ bookId, onChange }: TimelineControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'chapter' | 'story'>('chapter');
  const [position, setPosition] = useState(1);
  const [pendingDetection, setPendingDetection] = useState<TimelineDetectionResponse | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

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

  const chapterMax = config?.totalChapters ?? 1;
  const storyMax = config?.totalRankedEvents ?? 1;
  const currentMax = mode === 'chapter' ? chapterMax : storyMax;

  const chapterAvailable = (config?.chapterModeEnabled ?? false) && chapterMax > 0;
  const storyAvailable = (config?.storyModeEnabled ?? false) && storyMax > 0;
  const anyAvailable = chapterAvailable || storyAvailable;

  useEffect(() => {
    if (!config) return;
    const defaultMode = config.defaultMode === 'story' && storyAvailable ? 'story' : 'chapter';
    setMode(defaultMode);
    setPosition(1);
  }, [config, storyAvailable]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!enabled) {
      onChange(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      onChange({ mode, position });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, mode, position, onChange]);

  const handleModeChange = (newMode: 'chapter' | 'story') => {
    setMode(newMode);
    setPosition(1);
  };

  const handlePositionChange = (val: number) => {
    setPosition(Math.max(1, Math.min(currentMax, val)));
  };

  if (!anyAvailable) return null;

  return (
    <div
      className="absolute bottom-14 left-4 z-10 rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'white',
        border: '1px solid var(--border)',
        minWidth: 220,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center">
        <button
          className="flex-1 flex items-center justify-between px-3 py-2 text-xs font-medium"
          style={{ color: 'var(--fg-primary)' }}
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Clock size={13} style={{ color: 'var(--accent)' }} />
            <span>Timeline Snapshot</span>
            {enabled && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px]"
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
              >
                {mode === 'chapter' ? `Ch.${position}` : `#${position}`}
              </span>
            )}
          </div>
          {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        <button
          title="Reconfigure timeline"
          disabled={detectMutation.isPending}
          onClick={() => detectMutation.mutate()}
          className="px-2 py-2 flex-shrink-0"
          style={{ color: 'var(--fg-muted)' }}
        >
          <Settings size={12} className={detectMutation.isPending ? 'animate-spin' : ''} />
        </button>
      </div>

      {expanded && (
        <div
          className="px-3 pb-3 space-y-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {/* Enable toggle */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>Enable snapshot</span>
            <button
              onClick={() => setEnabled((v) => !v)}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{ backgroundColor: enabled ? 'var(--accent)' : 'var(--bg-tertiary)' }}
            >
              <span
                className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                style={{ transform: enabled ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </button>
          </div>

          {enabled && (
            <>
              {/* Mode selector */}
              {chapterAvailable && storyAvailable && (
                <div className="flex gap-1.5">
                  {(['chapter', 'story'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => handleModeChange(m)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium transition-colors"
                      style={{
                        backgroundColor: mode === m ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: mode === m ? 'white' : 'var(--fg-secondary)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {m === 'chapter' ? <BookOpen size={10} /> : <Clock size={10} />}
                      {m === 'chapter' ? 'Reading' : 'Story'}
                    </button>
                  ))}
                </div>
              )}

              {/* Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                    {mode === 'chapter' ? 'Up to chapter' : 'Up to event'}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--fg-primary)' }}>
                    {position} / {currentMax}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={currentMax}
                  value={position}
                  onChange={(e) => handlePositionChange(Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
              </div>
            </>
          )}
        </div>
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
