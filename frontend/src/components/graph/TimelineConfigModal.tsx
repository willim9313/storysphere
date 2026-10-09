import { useEffect, useRef, useState } from 'react';
import { BookOpen, Clock, X, CheckCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { updateTimelineConfig, type TimelineConfigResponse, type TimelineDetectionResponse } from '@/api/graph';
import { qk } from '@/api/queryKeys';

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
      queryClient.setQueryData(qk.timeline.config(bookId), data);
      onClose();
    },
  });

  return (
    <dialog ref={dialogRef} className="ss-dialog kg-tlcfg" onClose={onClose}>
      <div className="ss-dialog-body">
        <div className="kg-tlcfg-head">
          <h3 className="ss-dialog-title">{t('timeline.modal.title')}</h3>
          <button type="button" className="kg-icon-btn" onClick={onClose} aria-label={tc('close')}>
            <X size={18} />
          </button>
        </div>
        <p className="ss-dialog-text">{t('timeline.modal.subtitle')}</p>

        {/* Detection summary */}
        <div className="kg-tlcfg-stats">
          <Stat label={t('timeline.modal.chapters')} value={detection.chapterCount} />
          <Stat label={t('timeline.modal.events')} value={detection.eventCount} />
          <Stat label={t('timeline.modal.rankedEvents')} value={detection.rankedEventCount} />
        </div>

        {/* Mode cards */}
        <div className="kg-tlcfg-modes">
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

        <div className="ss-dialog-actions">
          <button className="ss-btn ss-btn-md ss-btn-secondary" onClick={onClose}>
            {t('timeline.modal.skip')}
          </button>
          <button
            className="ss-btn ss-btn-md ss-btn-primary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('timeline.modal.saving') : tc('confirm')}
          </button>
        </div>

        {mutation.isError && (
          <p className="kg-tlcfg-error">{(mutation.error as Error).message}</p>
        )}
      </div>
    </dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="kg-tlcfg-stat-value">{value}</div>
      <div className="kg-tlcfg-stat-label">{label}</div>
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
      className="kg-tlcfg-card"
      data-enabled={enabled || undefined}
      data-locked={locked || undefined}
    >
      <div className="kg-tlcfg-card-row">
        <div className="kg-tlcfg-card-main">
          <span className="kg-tlcfg-card-icon" data-viable={viable || undefined}>
            {icon}
          </span>
          <div className="kg-tlcfg-card-text">
            <div className="kg-tlcfg-card-title">
              {title}
              {viable && <CheckCircle size={12} className="kg-tlcfg-ok" />}
            </div>
            <p className="kg-tlcfg-card-desc">{description}</p>
            {lockedNote && <p className="kg-tlcfg-card-note">{lockedNote}</p>}
          </div>
        </div>
        <button
          disabled={!!locked}
          onClick={onToggle}
          className="kg-tlcfg-switch"
          data-on={enabled || undefined}
        >
          <span className="kg-tlcfg-knob" />
        </button>
      </div>
    </div>
  );
}
