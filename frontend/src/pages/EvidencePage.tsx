import { useMemo, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useBook } from '@/api/books';
import { useEvidence, type EvidenceItem } from '@/api/evidence';
import { useRegistryDag } from '@/api/registryExtra';
import { EvidenceCard, type SourceRef } from '@/components/detail/EvidenceCard';
import { SourcePanel } from '@/components/detail/SourcePanel';
import { EvidenceFilters } from '@/components/evidence/EvidenceFilters';
import { EvidenceTable } from '@/components/evidence/EvidenceTable';
import { useEvidenceBrowse, type EvidenceFilter } from '@/components/evidence/useEvidenceBrowse';
import { BookNav } from '@/components/layout/BookNav';
import { PageMain, PageHeader } from '@/components/layout/PageMain';
import { useDevView } from '@/hooks/useDevView';

const FILTER_KEYS = ['type', 'level', 'review', 'status', 'from', 'to', 'q'] as const;

const small: CSSProperties = { margin: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--fg-muted)', lineHeight: 1.6 };
const card: CSSProperties = {
  background: 'var(--bg-primary)',
  border: 'var(--card-border-width) var(--border-style) var(--border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
};

function errorText(error: unknown) {
  return error instanceof ApiError ? error.detail : String(error);
}

/** 選到的證據不在已載入的列表裡（網址帶進來的）時，另外讀 N-05b。 */
function OutsideEvidence({ bookId, evidenceId, onOpenSource }: Readonly<{ bookId: string; evidenceId: string; onOpenSource: (ref: SourceRef) => void }>) {
  const { data, error } = useEvidence(bookId, evidenceId);
  if (error) return <p role="alert" style={{ ...small, color: 'var(--color-error)' }}>讀不到這筆證據：{errorText(error)}</p>;
  if (!data) return <p style={small}>讀取中…</p>;
  const item: EvidenceItem = { ...data, quoteCount: data.quotes.length, firstQuote: data.quotes[0]?.text.slice(0, 120) ?? null };
  return <EvidenceCard bookId={bookId} item={item} selected onOpenSource={onOpenSource} />;
}

/** 畫面 7 證據瀏覽（05 §3）：篩選、分頁列表、右欄開單筆證據與原文。開發者檢視開啟時含第 1 層。 */
export function EvidencePage() {
  const { bookId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [devView] = useDevView();
  const [source, setSource] = useState<SourceRef | null>(null);
  const { data: book } = useBook(bookId);
  const dag = useRegistryDag();

  const filter = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? ''])) as unknown as EvidenceFilter;
  // 關掉開發者檢視時，網址裡的「第 1 層」篩選不生效。
  if (!devView && filter.level === '1') filter.level = '';
  const selectedId = params.get('ev');

  const update = (patch: Partial<EvidenceFilter> | { ev: string | null }) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  const claimTypes = useMemo(
    () =>
      (dag.data?.nodes ?? [])
        .filter((n) => n.kind === 'claim_type' && (devView || (n.level ?? 2) >= 2))
        .map((n) => ({ id: n.id, level: n.level ?? null }))
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.id.localeCompare(b.id)),
    [dag.data, devView],
  );
  const levels = useMemo(() => [...new Set(claimTypes.map((t) => t.level).filter((l): l is number => l !== null))].sort((a, b) => a - b), [claimTypes]);

  const list = useEvidenceBrowse(bookId, filter, devView);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const selected = items.find((item) => item.id === selectedId);

  return (
    <>
      <BookNav view="證據瀏覽" />
      <PageMain>
        <PageHeader title="證據瀏覽" meta={list.data ? `符合 ${total.toLocaleString()} 筆` : '…'} />
        <EvidenceFilters
          filter={filter}
          onChange={(patch) => update(patch)}
          claimTypes={claimTypes}
          levels={levels}
          chapterCount={book?.chapterCount ?? 0}
        />
        <p style={{ ...small, color: 'var(--fg-secondary)', marginTop: 'calc(-1 * var(--space-3))' }}>
          {devView
            ? '開發者檢視開啟中：列表含第 1 層證據。第 1 層唯讀；一般使用者看不到這一層。'
            : '列表只含第 2 層以上的證據；第 1 層要在設定打開「開發者檢視」才看得到。'}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
          <section aria-label="證據列表" style={{ ...card, flex: '999 1 640px', minWidth: 0, overflowX: 'auto' }}>
            {list.isLoading && <p style={{ ...small, padding: 'var(--space-5)' }}>讀取中…</p>}
            {list.error && (
              <p role="alert" style={{ ...small, padding: 'var(--space-5)', color: 'var(--color-error)' }}>
                讀不到證據：{errorText(list.error)}
              </p>
            )}
            {list.data && items.length === 0 && <p style={{ ...small, padding: 'var(--space-5)' }}>沒有符合的證據。</p>}
            {items.length > 0 && <EvidenceTable items={items} selectedId={selectedId} onSelect={(id) => update({ ev: id })} />}
            {items.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-4) var(--space-5)',
                  borderTop: 'var(--border-width) var(--border-style) var(--border)',
                  ...small,
                }}
              >
                <span>
                  顯示 {items.length.toLocaleString()}／{total.toLocaleString()} 筆
                </span>
                {list.hasNextPage && (
                  <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                    {list.isFetchingNextPage ? '讀取中…' : '載入更多'}
                  </button>
                )}
              </div>
            )}
          </section>

          <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', position: 'sticky', top: 'var(--space-5)' }}>
            {selectedId === null && (
              <div style={{ ...card, padding: 'var(--space-5) var(--space-6)' }}>
                <p style={small}>點一列看這筆證據的引文、審核與追溯。</p>
              </div>
            )}
            {selected && <EvidenceCard key={selected.id} bookId={bookId} item={selected} selected onOpenSource={setSource} />}
            {selectedId !== null && !selected && !list.isLoading && (
              <OutsideEvidence key={selectedId} bookId={bookId} evidenceId={selectedId} onOpenSource={setSource} />
            )}
            {source && <SourcePanel bookId={bookId} source={source} onClose={() => setSource(null)} />}
          </div>
        </div>
      </PageMain>
    </>
  );
}
