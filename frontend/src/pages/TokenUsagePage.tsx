import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useTokenUsage } from '@/hooks/useTokenUsage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PageFailure } from '@/components/ui/PageFailure';
import { failureKind, techDetailOf } from '@/api/failureKind';
import {
  DEFAULT_RANGE,
  bookKey,
  bookLabel,
  bookRows,
  dailyScale,
  parseRange,
  selectedLabel,
  sortBuckets,
  toggleSelected,
  type BucketRow,
  type Range,
} from '@/components/tokenUsage/tokenUsageModel';
import '@/styles/token-usage.css';

function fmt(n: number): string {
  return n.toLocaleString();
}

export default function TokenUsagePage() {
  // Range and book live in the URL so a view can be reopened or linked to.
  const [params, setParams] = useSearchParams();
  const range = parseRange(params.get('range'));
  const bookId = params.get('book');
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');

  const update = (next: { range?: Range; book?: string | null }) => {
    const p = new URLSearchParams(params);
    if (next.range !== undefined) {
      if (next.range === DEFAULT_RANGE) p.delete('range');
      else p.set('range', next.range);
    }
    if (next.book !== undefined) {
      if (next.book === null) p.delete('book');
      else p.set('book', next.book);
    }
    setParams(p, { replace: true });
  };
  const setBookId = (book: string | null) => update({ book });

  // Two queries, one cache entry while nothing is selected: the unfiltered one
  // is what the book list and the byBook table are built from, so picking a
  // book never hides the other books you might want to switch to.
  const allBooks = useTokenUsage(range);
  const selected = useTokenUsage(range, bookId ?? undefined);
  const data = selected.data;
  const books = allBooks.data?.byBook ?? [];
  const error = allBooks.error ?? selected.error;
  const loading =
    !error &&
    (allBooks.isLoading || selected.isLoading || allBooks.isPlaceholderData || selected.isPlaceholderData);

  // The selected book may have no calls in this range. It stays selected (the
  // user picked it), so its name has to come from somewhere else: the all-time
  // list, fetched only in that case.
  const selectedMissing = bookId !== null && !books.some((b) => bookKey(b.bookId) === bookId);
  const allTime = useTokenUsage('all', undefined, selectedMissing && !loading && range !== 'all');

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
  // Still looking → an ellipsis; nobody knows it → the id stub, the same handle a deleted book gets.
  const selectedTitle =
    bookId === null
      ? ''
      : (selectedLabel(bookId, [books, allTime.data?.byBook ?? []], labels) ??
        (loading || allTime.isFetching ? '…' : bookId.slice(0, 8)));

  const retry = () => {
    void allBooks.refetch();
    if (bookId !== null) void selected.refetch();
  };

  const byBook = bookRows(books);
  const bookLabels = new Map(books.map((b) => [bookKey(b.bookId), bookLabel(b, labels)]));
  const byBookSection = byBook.length > 0 && (
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
  );

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
  } else if (data.summary.totalCalls === 0 && bookId !== null) {
    // Only this book is empty here; the table still lets you switch to one that isn't.
    body = (
      <>
        <div className="tu-empty">{t('token.bookNoData', { title: selectedTitle })}</div>
        {byBookSection}
      </>
    );
  } else if (data.summary.totalCalls === 0) {
    body = <div className="tu-empty">{t('token.noData')}</div>;
  } else {
    const byService = sortBuckets(data.byService);
    const byModel = sortBuckets(data.byModel);
    const daily = dailyScale(data.daily);

    body = (
      <>
        {bookId !== null && (
          <p className="tu-scope">
            {t('token.scopeOnly', { title: selectedTitle })}
            <span aria-hidden> · </span>
            <button type="button" className="ss-btn ss-btn-ghost ss-btn-sm" onClick={() => setBookId(null)}>
              {t('token.showAllBooks')}
            </button>
          </p>
        )}
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

        {byBookSection}

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
                <div key={d.date} className="tu-daily-row">
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
            {(books.length > 0 || bookId !== null) && (
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
                {/* Without its own option the select would show 「全部書籍」 while the filter is still on. */}
                {selectedMissing && <option value={bookId}>{selectedTitle}</option>}
              </select>
            )}
            <div className="tu-ranges">
              {RANGES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="tu-range"
                  aria-pressed={range === key}
                  onClick={() => update({ range: key })}
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
