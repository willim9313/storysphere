import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchEventAnalysisDetail } from '@/api/analysis';
import type { AnalysisItem, EventAnalysisDetail } from '@/api/types';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { qk } from '@/api/queryKeys';

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
    queryKey: qk.event.analysis(bookId, eventId),
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

  useEscapeKey(open, onClose);

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
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-ghost"
            aria-label={t('event.compare.close')}
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </header>
        <div className="ea-compare-grid">
          <div className="ea-compare-selrow">
            <span />
            <CompareSelect side="A" value={aId} options={analyzed} onChange={setAId} />
            <CompareSelect side="B" value={bId} options={analyzed} onChange={setBId} />
          </div>
          <CompareRow
            label={t('event.labels.before')}
            a={a}
            b={b}
            render={(d) => d.eep.stateBefore}
          />
          <CompareRow
            label={t('event.labels.after')}
            a={a}
            b={b}
            render={(d) => d.eep.stateAfter}
          />
          <CompareRow
            label={t('event.labels.participantImpacts')}
            a={a}
            b={b}
            render={(d) =>
              d.impact.participantImpacts.length > 0 ? (
                <ul className="ea-compare-list">
                  {d.impact.participantImpacts.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : (
                <p className="ea-compare-empty">{t('event.compare.noImpact')}</p>
              )
            }
          />
        </div>
      </aside>
    </>
  );
}

type DetailQuery = { data: EventAnalysisDetail | undefined; isLoading: boolean };

function CompareSelect({
  side,
  value,
  options,
  onChange,
}: Readonly<{
  side: string;
  value: string | null;
  options: AnalysisItem[];
  onChange: (id: string) => void;
}>) {
  const { t } = useTranslation('analysis');
  return (
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
  );
}

/** One aligned row of the 72px · 1fr · 1fr grid — 之前／之後／影響 are the only
 *  structures two events can be compared on side by side. */
function CompareRow({
  label,
  a,
  b,
  render,
}: Readonly<{
  label: string;
  a: DetailQuery;
  b: DetailQuery;
  render: (d: EventAnalysisDetail) => React.ReactNode;
}>) {
  const { t } = useTranslation('analysis');
  const cell = (q: DetailQuery) =>
    q.isLoading ? (
      <span className="ea-compare-loading">{t('analyzing')}</span>
    ) : q.data ? (
      render(q.data)
    ) : null;
  return (
    <>
      <div className="ea-compare-rowlabel">{label}</div>
      <div className="ea-compare-cell">{cell(a)}</div>
      <div className="ea-compare-cell">{cell(b)}</div>
    </>
  );
}
