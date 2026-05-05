import { useEffect, useRef, useState } from 'react';
import { BookOpen, Clock, X, CheckCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { updateTimelineConfig, type TimelineConfigResponse, type TimelineDetectionResponse } from '@/api/graph';

interface TimelineConfigModalProps {
  bookId: string;
  detection: TimelineDetectionResponse;
  onClose: () => void;
}

export function TimelineConfigModal({ bookId, detection, onClose }: TimelineConfigModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const { t } = useTranslation('graph');
  const { t: tc } = useTranslation('common');

  const [chapterEnabled, setChapterEnabled] = useState(detection.chapterModeViable);
  const [storyEnabled, setStoryEnabled] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const mutation = useMutation({
    mutationFn: () =>
      updateTimelineConfig(bookId, {
        chapterModeEnabled: chapterEnabled,
        storyModeEnabled: storyEnabled,
        chapterModeConfigured: true,
      }),
    onSuccess: (data: TimelineConfigResponse) => {
      queryClient.setQueryData(['books', bookId, 'timeline-config'], data);
      onClose();
    },
  });

  return (
    <dialog
      ref={dialogRef}
      className="rounded-xl p-0 backdrop:bg-black/40"
      style={{
        backgroundColor: 'white',
        color: 'var(--fg-primary)',
        border: '1px solid var(--border)',
        maxWidth: 480,
        width: '90vw',
      }}
      onClose={onClose}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold" style={{ fontFamily: 'var(--font-serif)' }}>
            {t('timeline.modal.title')}
          </h3>
          <button onClick={onClose} style={{ color: 'var(--fg-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--fg-secondary)' }}>
          {t('timeline.modal.subtitle')}
        </p>

        {/* Detection summary */}
        <div
          className="rounded-lg p-3 mb-5 grid grid-cols-3 gap-3 text-center"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <Stat label={t('timeline.modal.chapters')} value={detection.chapterCount} />
          <Stat label={t('timeline.modal.events')} value={detection.eventCount} />
          <Stat label={t('timeline.modal.rankedEvents')} value={detection.rankedEventCount} />
        </div>

        {/* Mode cards */}
        <div className="space-y-3 mb-6">
          <ModeCard
            icon={<BookOpen size={16} />}
            title={t('timeline.modal.chapterMode.title')}
            description={t('timeline.modal.chapterMode.description')}
            viable={detection.chapterModeViable}
            enabled={chapterEnabled}
            onToggle={() => setChapterEnabled((v) => !v)}
          />
          <ModeCard
            icon={<Clock size={16} />}
            title={t('timeline.modal.storyMode.title')}
            description={t('timeline.modal.storyMode.description')}
            viable={detection.storyModeViable}
            enabled={storyEnabled}
            locked={!detection.storyModeViable}
            lockedNote={
              detection.rankedEventCount === 0
                ? t('timeline.modal.storyMode.locked')
                : undefined
            }
            onToggle={() => setStoryEnabled((v) => !v)}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            className="px-4 py-2 rounded-md text-sm"
            style={{ color: 'var(--fg-secondary)', border: '1px solid var(--border)' }}
            onClick={onClose}
          >
            {t('timeline.modal.skip')}
          </button>
          <button
            className="px-4 py-2 rounded-md text-sm font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('timeline.modal.saving') : tc('confirm')}
          </button>
        </div>

        {mutation.isError && (
          <p className="text-xs mt-2 text-right" style={{ color: 'var(--color-error)' }}>
            {(mutation.error as Error).message}
          </p>
        )}
      </div>
    </dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--fg-primary)' }}>
        {value}
      </div>
      <div className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>{label}</div>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  description,
  viable,
  enabled,
  locked,
  lockedNote,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  viable: boolean;
  enabled: boolean;
  locked?: boolean;
  lockedNote?: string;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        border: `1px solid ${enabled ? 'var(--accent)' : 'var(--border)'}`,
        backgroundColor: enabled ? 'color-mix(in srgb, var(--accent) 5%, var(--bg-primary))' : 'var(--bg-secondary)',
        opacity: locked ? 0.55 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="mt-0.5 flex-shrink-0" style={{ color: viable ? 'var(--accent)' : 'var(--fg-muted)' }}>
            {icon}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--fg-primary)' }}>
              {title}
              {viable && <CheckCircle size={12} style={{ color: 'var(--color-success)' }} />}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--fg-secondary)' }}>{description}</p>
            {lockedNote && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>{lockedNote}</p>
            )}
          </div>
        </div>
        <button
          disabled={!!locked}
          onClick={onToggle}
          className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors mt-0.5"
          style={{ backgroundColor: enabled ? 'var(--accent)' : 'var(--bg-tertiary)' }}
        >
          <span
            className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
            style={{ transform: enabled ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </button>
      </div>
    </div>
  );
}
