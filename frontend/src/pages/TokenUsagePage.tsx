import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useTokenUsage } from '@/hooks/useTokenUsage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PageFailure } from '@/components/ui/PageFailure';
import { failureKind, techDetailOf } from '@/api/failureKind';
import {
  bookKey,
  bookLabel,
  bookRows,
  dailyScale,
  sortBuckets,
  toggleSelected,
  type BucketRow,
} from '@/components/tokenUsage/tokenUsageModel';
import '@/styles/token-usage.css';

type Range = 'today' | '7d' | '30d' | 'all';

function fmt(n: number): string {
  return n.toLocaleString();
}

export default function TokenUsagePage() {
  const [range, setRange] = useState<Range>('7d');
  const [bookId, setBookId] = useState<string | null>(null);
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');

  // Two queries, one cache entry while nothing is selected: the unfiltered one
  // is what the book list and the byBook table are built from, so picking a
  // book never hides the other books you might want to switch to.
  const allBooks = useTokenUsage(range);
  const selected = useTokenUsage(range, bookId ?? undefined);
  const data = selected.data;
  const books = allBooks.data?.byBook ?? [];
  const error = allBooks.error ?? selected.error;
  const loading = !error && (allBooks.isLoading || selected.isLoading);

  const RANGES: { key: Range; label: string }[] = [
    { key: 'today', label: t('token.today') },
    { key: '7d', label: t('token.days7') },
    { key: '30d', label: t('token.days30') },
    { key: 'all', label: t('token.all') },
  ];

  const labels = {
    unattributed: t('token.unattributed'),
    deleted: (id: string) => t('token.deletedBook', { id }),
  };

  const retry = () => {
    void allBooks.refetch();
    if (bookId !== null) void selected.refetch();
  };

  let body;
  if (error) {
    body = (
      <PageFailure
        variant={failureKind(error)}
        pageName={t('token.title')}
        onRetry={retry}
        techDetail={techDetailOf(error)}
      />
    );
  } else if (loading || !data) {
    body = (
      <LoadingSpinner className="tu-loading" label={tc('loading')} />
    );
  } else if (data.summary.totalCalls === 0) {
    body = <div className="tu-empty">{t('token.noData')}</div>;
  } else {
    const byBook = bookRows(books);
    const byService = sortBuckets(data.byService);
    const byModel = sortBuckets(data.byModel);
    const daily = dailyScale(data.daily);
    const bookLabels = new Map(books.map((b) => [bookKey(b.bookId), bookLabel(b, labels)]));

    body = (
      <>
        <div className="ss-stats-row">
          <div className="ss-stat">
            <span className="ss-stat-value">{fmt(data.summary.totalPromptTokens)}</span>
            <span className="ss-stat-label">Prompt Tokens</span>
          </div>
          <div className="ss-stat">
            <span className="ss-stat-value">{fmt(data.summary.totalCompletionTokens)}</span>
            <span className="ss-stat-label">Completion Tokens</span>
          </div>
          <div className="ss-stat">
            <span className="ss-stat-value">{fmt(data.summary.totalCalls)}</span>
            <span className="ss-stat-label">{t('token.totalCalls')}</span>
          </div>
        </div>

        {byBook.length > 0 && (
          <section className="tu-section">
            <h3 className="tu-section-title">{t('token.byBook')}</h3>
            {bookId !== null && <p className="tu-scope-note">{t('token.byBookScope')}</p>}
            <BreakdownTable
              rows={byBook}
              labelFn={(k) => bookLabels.get(k) ?? k}
              selectedKey={bookId}
              onSelect={(k) => setBookId(toggleSelected(bookId, k))}
            />
          </section>
        )}

        {(byService.length > 0 || byModel.length > 0) && (
          <div className="tu-pair">
            {byService.length > 0 && (
              <section className="tu-section">
                <h3 className="tu-section-title">{t('token.byService')}</h3>
                <BreakdownTable
                  rows={byService}
                  labelFn={(k) => t(`token.services.${k}`, { defaultValue: k })}
                />
              </section>
            )}
            {byModel.length > 0 && (
              <section className="tu-section">
                <h3 className="tu-section-title">{t('token.byModel')}</h3>
                <BreakdownTable rows={byModel} labelFn={(k) => k} />
              </section>
            )}
          </div>
        )}

        {daily && (
          <section className="tu-section">
            <div className="tu-section-head">
              <h3 className="tu-section-title">{t('token.dailyTrend')}</h3>
              <span className="tu-daily-note">
                {t('token.dailyNote', { date: daily.baseLabel, value: fmt(daily.baseValue) })}
              </span>
            </div>
            <div className="tu-daily">
              {daily.rows.map((d) => (
                <div key={d.label} className="tu-daily-row">
                  <code className="tu-daily-date">{d.label}</code>
                  <div className="tu-daily-track">
                    <div className="tu-daily-bar" style={{ width: `${d.pct}%` }} />
                  </div>
                  <span className="tu-daily-value">{fmt(d.totalTokens)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <div className="tu-page">
      <div className="tu-inner">
        <div className="tu-head">
          <h2 className="tu-title">{t('token.title')}</h2>
          <div className="tu-controls">
            {books.length > 0 && (
              <select
                className="tu-book-select"
                value={bookId ?? ''}
                onChange={(e) => setBookId(e.target.value === '' ? null : e.target.value)}
              >
                <option value="">{t('token.allBooks')}</option>
                {books.map((b) => (
                  <option key={bookKey(b.bookId)} value={bookKey(b.bookId)}>
                    {bookLabel(b, labels)}
                  </option>
                ))}
              </select>
            )}
            <div className="tu-ranges">
              {RANGES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="tu-range"
                  aria-pressed={range === key}
                  onClick={() => setRange(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}

function BreakdownTable({
  rows,
  labelFn,
  selectedKey,
  onSelect,
}: Readonly<{
  rows: BucketRow[];
  labelFn: (key: string) => string;
  /** Only the byBook table is pickable; the others pass neither prop. */
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}>) {
  const { t } = useTranslation('settings');
  const heads = [t('token.colName'), 'Prompt', t('token.colCompletion'), t('token.colTotal'), t('token.colCalls')];
  const pickable = onSelect !== undefined;

  return (
    <div className="tu-table-wrap">
      <table className="tu-table">
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, bucket }) => {
            const isSelected = pickable && selectedKey === key;
            let cls: string | undefined;
            if (pickable) cls = isSelected ? 'tu-row-pick tu-row-selected' : 'tu-row-pick';
            return (
              <tr key={key} className={cls} onClick={pickable ? () => onSelect(key) : undefined}>
                <td className="tu-name">
                  {pickable ? (
                    <button
                      type="button"
                      className="tu-pick-btn"
                      aria-pressed={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(key);
                      }}
                    >
                      {isSelected && <Check size={12} className="tu-check" aria-hidden />}
                      {labelFn(key)}
                    </button>
                  ) : (
                    labelFn(key)
                  )}
                </td>
                <td>{fmt(bucket.promptTokens)}</td>
                <td>{fmt(bucket.completionTokens)}</td>
                <td className="tu-total">{fmt(bucket.totalTokens)}</td>
                <td className="tu-calls">{fmt(bucket.calls)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
