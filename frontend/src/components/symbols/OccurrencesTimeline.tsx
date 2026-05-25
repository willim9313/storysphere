import { useMemo, type ReactNode } from 'react';
import { Telescope } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { SymbolTimelineEntry } from '@/api/symbols';

interface Props {
  timeline: SymbolTimelineEntry[];
  loading: boolean;
  term: string;
  aliases: string[];
}

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(s: string): string {
  return s.replace(ESCAPE_REGEX, String.raw`\$&`);
}

function highlight(text: string, term: string, aliases: string[]): ReactNode {
  const all = [term, ...aliases].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!text || all.length === 0) return text;
  const pattern = new RegExp(`(${all.map(escapeRegExp).join('|')})`, 'g');
  const parts = text.split(pattern);
  const allSet = new Set(all);
  return parts.map((p, i) => {
    const key = `${i}-${p}`;
    if (allSet.has(p)) {
      return (
        <mark key={key} className="sym-mark">
          {p}
        </mark>
      );
    }
    return <span key={key}>{p}</span>;
  });
}

function renderBody({
  loading,
  timeline,
  grouped,
  term,
  aliases,
  t,
}: {
  loading: boolean;
  timeline: SymbolTimelineEntry[];
  grouped: ReadonlyArray<readonly [number, SymbolTimelineEntry[]]>;
  term: string;
  aliases: string[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}): ReactNode {
  if (loading) {
    return (
      <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  }
  if (timeline.length === 0) {
    return (
      <p className="sym-card-empty" style={{ padding: '12px 14px' }}>
        {t('symbol.noOccurrences')}
      </p>
    );
  }
  return (
    <div className="sym-occ">
      {grouped.map(([ch, items]) => (
        <div key={ch} className="sym-occ-group">
          <div className="sym-occ-ch">
            <span className="sym-occ-chnum">{t('symbol.chapterN', { n: ch })}</span>
            <span className="sym-occ-chcount">{t('symbol.chapterOccurrences', { count: items.length })}</span>
            <span className="sym-occ-chline" />
          </div>
          {items.map((item) => (
            <div key={item.occurrence_id} className="sym-occ-row">
              <span className="sym-occ-pos">#{item.position}</span>
              <div className="sym-occ-text">
                「{highlight(item.context_window, term, aliases)}」
              </div>
              <div className="sym-occ-side">
                {item.co_occurring_terms.slice(0, 3).map((tag) => (
                  <span key={tag} className="sym-occ-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function OccurrencesTimeline({ timeline, loading, term, aliases }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const grouped = useMemo(() => {
    const g: Record<number, SymbolTimelineEntry[]> = {};
    timeline.forEach((e) => {
      const list = g[e.chapter_number] ?? [];
      list.push(e);
      g[e.chapter_number] = list;
    });
    return Object.entries(g)
      .map(([ch, items]) => [Number(ch), items] as const)
      .sort((a, b) => a[0] - b[0]);
  }, [timeline]);

  return (
    <section className="sym-card">
      <div className="sym-card-head">
        <Telescope size={13} style={{ color: 'var(--accent)' }} />
        <span className="sym-card-title">{t('symbol.occurrences')}</span>
        <span className="sym-card-meta">
          {t('symbol.occurrenceSpan', { count: timeline.length, chapters: grouped.length })}
        </span>
      </div>
      {renderBody({ loading, timeline, grouped, term, aliases, t })}
    </section>
  );
}
