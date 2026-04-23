import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTokenUsage } from '@/hooks/useTokenUsage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { TokenBucket } from '@/api/tokenUsage';

type Range = 'today' | '7d' | '30d' | 'all';

function fmt(n: number): string {
  return n.toLocaleString();
}

export default function TokenUsagePage() {
  const [range, setRange] = useState<Range>('7d');
  const { data, isLoading, error } = useTokenUsage(range);
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

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
          {t('token.title')}
        </h2>
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
}: {
  data: Record<string, TokenBucket>;
  labelFn: (key: string) => string;
  t: (key: string) => string;
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
            <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
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
                  className="h-full rounded transition-all"
                  style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: 'var(--accent)', opacity: 0.85 }}
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
