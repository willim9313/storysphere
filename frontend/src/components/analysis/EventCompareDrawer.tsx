import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchEventAnalysisDetail } from '@/api/analysis';
import type { AnalysisItem, EventAnalysisDetail } from '@/api/types';

interface EventCompareDrawerProps {
  open: boolean;
  bookId: string;
  /** Only analyzed events can be compared — they are the ones with a #7d payload. */
  analyzed: AnalysisItem[];
  /** Pre-fill the left column, e.g. the event whose detail the user came from. */
  initialA?: string | null;
  onClose: () => void;
}

function useEventDetail(bookId: string, eventId: string | null) {
  return useQuery({
    queryKey: ['books', bookId, 'events', eventId, 'analysis'],
    queryFn: () => fetchEventAnalysisDetail(bookId, eventId!),
    enabled: !!eventId,
  });
}

export function EventCompareDrawer({
  open,
  bookId,
  analyzed,
  initialA,
  onClose,
}: Readonly<EventCompareDrawerProps>) {
  const { t } = useTranslation('analysis');

  const defaultA = initialA ?? analyzed[0]?.entityId ?? null;
  const defaultB = analyzed.find((a) => a.entityId !== defaultA)?.entityId ?? null;
  const [aId, setAId] = useState<string | null>(defaultA);
  const [bId, setBId] = useState<string | null>(defaultB);

  // Re-seed each time the drawer is opened so the entry point's context wins.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setAId(defaultA);
      setBId(defaultB);
    }
  }, [open, defaultA, defaultB]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const a = useEventDetail(bookId, open ? aId : null);
  const b = useEventDetail(bookId, open ? bId : null);

  if (!open) return null;

  return (
    <>
      <div className="ea-compare-backdrop" onClick={onClose} />
      <aside className="ea-compare-drawer" role="dialog" aria-modal="true">
        <header className="ea-compare-head">
          <div>
            <h3 className="ea-compare-title">{t('event.compare.title')}</h3>
            <p className="ea-compare-sub">{t('event.compare.subtitle')}</p>
          </div>
          <button type="button" className="ea-btn" onClick={onClose}>
            <X size={14} /> {t('event.compare.close')}
          </button>
        </header>
        <div className="ea-compare-body">
          <CompareColumn
            side="A"
            value={aId}
            options={analyzed}
            onChange={setAId}
            detail={a.data}
            loading={a.isLoading}
          />
          <CompareColumn
            side="B"
            value={bId}
            options={analyzed}
            onChange={setBId}
            detail={b.data}
            loading={b.isLoading}
          />
        </div>
      </aside>
    </>
  );
}

function CompareColumn({
  side,
  value,
  options,
  onChange,
  detail,
  loading,
}: Readonly<{
  side: string;
  value: string | null;
  options: AnalysisItem[];
  onChange: (id: string) => void;
  detail: EventAnalysisDetail | undefined;
  loading: boolean;
}>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="ea-compare-col">
      <select
        className="ea-compare-select"
        value={value ?? ''}
        aria-label={t('event.compare.pick', { side })}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.entityId} value={o.entityId}>
            {o.chapter != null ? `Ch.${o.chapter} · ${o.title}` : o.title}
          </option>
        ))}
      </select>

      {loading && <div className="ea-compare-loading">{t('analyzing')}</div>}

      {!loading && detail && (
        <div className="ea-compare-card">
          <div className="ea-compare-card-head">
            <div className="ea-compare-card-title">{detail.title}</div>
            <div className="ea-compare-card-meta">
              {detail.chapter != null && t('event.list.chapterShort', { n: detail.chapter })}
              {detail.eep.eventImportance && ` · ${detail.eep.eventImportance}`}
            </div>
          </div>
          <div className="ea-compare-card-body">
            <Field label={t('event.labels.before')} text={detail.eep.stateBefore} />
            <Field label={t('event.labels.after')} text={detail.eep.stateAfter} accent />
            <div>
              <div className="ea-compare-field-label">{t('event.labels.participantImpacts')}</div>
              {detail.impact.participantImpacts.length > 0 ? (
                <ul className="ea-compare-list">
                  {detail.impact.participantImpacts.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : (
                <p className="ea-compare-empty">{t('event.compare.noImpact')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, text, accent }: Readonly<{ label: string; text: string; accent?: boolean }>) {
  return (
    <div>
      <div className={'ea-compare-field-label' + (accent ? ' accent' : '')}>{label}</div>
      <p className="ea-compare-field-text">{text}</p>
    </div>
  );
}
