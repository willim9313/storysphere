import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTokenUsage } from '@/hooks/useTokenUsage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { BookUsage, TokenBucket } from '@/api/tokenUsage';
import { UNATTRIBUTED } from '@/api/tokenUsage';

type Range = 'today' | '7d' | '30d' | 'all';

function fmt(n: number): string {
  return n.toLocaleString();
}

/** A book row's key. `null` is a real group but cannot be an object key. */
function bookKey(bookId: string | null): string {
  return bookId ?? UNATTRIBUTED;
}

export default function TokenUsagePage() {
  const [range, setRange] = useState<Range>('7d');
  const [bookId, setBookId] = useState<string | null>(null);

  // Two queries, one cache entry while nothing is selected: the unfiltered one
  // is what the book list is built from, so picking a book never hides the
  // other books you might want to switch to.
  const allBooks = useTokenUsage(range);
  const { data, isLoading, error } = useTokenUsage(range, bookId ?? undefined);
  const { t } = useTranslation('settings');

  const RANGES: { key: Range; label: string }[] = [
    { key: 'today', label: t('token.today') },
    { key: '7d', label: t('token.days7') },
    { key: '30d', label: t('token.days30') },
    { key: 'all', label: t('token.all') },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error.message} />;

  const empty = !data || data.summary.totalCalls === 0;
  const books = allBooks.data?.byBook ?? [];

  const bookLabel = (book: BookUsage): string => {
    if (book.bookId === null) return t('token.unattributed');
    // A deleted book keeps its spending but loses its title; the id stub is
    // the only handle left, and it still tells two deleted books apart.
    return book.title ?? t('token.deletedBook', { id: book.bookId.slice(0, 8) });
  };

  const bookLabels = new Map(books.map((b) => [bookKey(b.bookId), bookLabel(b)]));
  const byBookTable = Object.fromEntries(
    books.map((b) => [
      bookKey(b.bookId),
      {
        promptTokens: b.promptTokens,
        completionTokens: b.completionTokens,
        totalTokens: b.totalTokens,
        calls: b.calls,
      },
    ]),
  );

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
          {t('token.title')}
        </h2>
        <div className="flex items-center gap-3">
          {books.length > 0 && (
            <select
              value={bookId ?? ''}
              onChange={(e) => setBookId(e.target.value === '' ? null : e.target.value)}
              className="px-3 py-1 text-xs rounded-full font-medium"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--fg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <option value="">{t('token.allBooks')}</option>
              {books.map((b) => (
                <option key={bookKey(b.bookId)} value={bookKey(b.bookId)}>
                  {bookLabel(b)}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1.5">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className="px-3 py-1 text-xs rounded-full font-medium transition-colors"
              style={{
                backgroundColor: range === key ? 'var(--accent)' : 'var(--bg-secondary)',
                color: range === key ? 'white' : 'var(--fg-secondary)',
              }}
            >
              {label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {empty ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg py-20"
          style={{ border: '2px dashed var(--border)', color: 'var(--fg-muted)' }}
        >
          <span className="text-sm">{t('token.noData')}</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <SummaryCard label="Prompt Tokens" value={fmt(data!.summary.totalPromptTokens)} />
            <SummaryCard label="Completion Tokens" value={fmt(data!.summary.totalCompletionTokens)} />
            <SummaryCard label={t('token.totalCalls')} value={fmt(data!.summary.totalCalls)} />
          </div>

          {books.length > 0 && (
            <Section title={t('token.byBook')}>
              <BreakdownTable
                data={byBookTable}
                labelFn={(k) => bookLabels.get(k) ?? k}
                t={t}
                selectedKey={bookId}
                onSelect={(k) => setBookId(bookId === k ? null : k)}
              />
            </Section>
          )}

          {Object.keys(data!.byService).length > 0 && (
            <Section title={t('token.byService')}>
              <BreakdownTable
                data={data!.byService}
                labelFn={(k) => t(`token.services.${k}`, { defaultValue: k })}
                t={t}
              />
            </Section>
          )}

          {Object.keys(data!.byModel).length > 0 && (
            <Section title={t('token.byModel')}>
              <BreakdownTable data={data!.byModel} labelFn={(k) => k} t={t} />
            </Section>
          )}

          {data!.daily.length > 0 && (
            <Section title={t('token.dailyTrend')}>
              <DailyChart daily={data!.daily} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-5 py-4"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="text-xs mb-1" style={{ color: 'var(--fg-muted)' }}>{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--fg-primary)' }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg-secondary)' }}>{title}</h3>
      {children}
    </div>
  );
}

function BreakdownTable({
  data,
  labelFn,
  t,
  selectedKey,
  onSelect,
}: {
  data: Record<string, TokenBucket>;
  labelFn: (key: string) => string;
  t: (key: string) => string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b.totalTokens - a.totalTokens);

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {[t('token.colName'), 'Prompt', t('token.colCompletion'), t('token.colTotal'), t('token.colCalls')].map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2 font-medium"
                style={{ color: 'var(--fg-muted)', borderBottom: '1px solid var(--border)' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, bucket]) => (
            <tr
              key={key}
              onClick={onSelect ? () => onSelect(key) : undefined}
              style={{
                borderBottom: '1px solid var(--border)',
                cursor: onSelect ? 'pointer' : undefined,
                backgroundColor:
                  selectedKey === key ? 'var(--bg-secondary)' : undefined,
              }}
            >
              <td className="px-4 py-2 font-medium" style={{ color: 'var(--fg-primary)' }}>{labelFn(key)}</td>
              <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--fg-secondary)' }}>{fmt(bucket.promptTokens)}</td>
              <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--fg-secondary)' }}>{fmt(bucket.completionTokens)}</td>
              <td className="px-4 py-2 tabular-nums font-medium" style={{ color: 'var(--fg-primary)' }}>{fmt(bucket.totalTokens)}</td>
              <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--fg-muted)' }}>{fmt(bucket.calls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyChart({ daily }: { daily: { date: string; totalTokens: number; calls: number }[] }) {
  const max = Math.max(...daily.map((d) => d.totalTokens), 1);

  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col gap-2">
        {daily.map((d) => {
          const pct = (d.totalTokens / max) * 100;
          return (
            <div key={d.date} className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 tabular-nums" style={{ color: 'var(--fg-muted)' }}>
                {d.date.slice(5)}
              </span>
              <div className="flex-1 h-5 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div
                  className="h-full rounded transition-all theme-progress-fill"
                  style={{ width: `${Math.max(pct, 0.5)}%`, opacity: 0.85 }}
                />
              </div>
              <span className="w-20 text-right shrink-0 tabular-nums" style={{ color: 'var(--fg-secondary)' }}>
                {fmt(d.totalTokens)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
