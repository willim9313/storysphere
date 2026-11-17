import { useMemo, useState } from 'react';
import { ApiError } from '@/api/client';
import { useReviewData, useSubmitReview, type ReviewChapter } from '@/api/ingest';

// 02 §1 的章節角色（domain/documents.ChapterRole）。
const ROLES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'body', label: '正文' },
  { value: 'preface', label: '前言' },
  { value: 'toc', label: '目錄' },
  { value: 'afterword', label: '後記' },
  { value: 'other', label: '其他' },
];

const cellStyle = {
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: 'var(--border-width) var(--border-style) var(--border)',
  textAlign: 'left' as const,
  verticalAlign: 'top' as const,
};

/**
 * 章節審閱（簡化版，使用者 2026-11-17 決定）：只能改每章的角色，不合併、切分、改標題。
 * 有改角色就送 `chapters`（每章的起始段＝第一段的全書索引）；沒改＝接受系統判斷。
 */
export function ChapterReview({ bookId }: Readonly<{ bookId: string }>) {
  const { data, isLoading, error } = useReviewData(bookId, true);
  const submit = useSubmitReview(bookId);
  const [roles, setRoles] = useState<Record<number, string>>({});

  const chapters = useMemo(() => data?.chapters ?? [], [data]);
  const roleOf = (chapter: ReviewChapter) => roles[chapter.chapterIdx] ?? chapter.role;
  const changed = chapters.some((chapter) => roleOf(chapter) !== chapter.role);
  const bodyCount = chapters.filter((chapter) => roleOf(chapter) === 'body').length;

  const send = () => {
    if (!changed) {
      submit.mutate({});
      return;
    }
    submit.mutate({
      chapters: chapters
        .filter((chapter) => chapter.paragraphs.length > 0)
        .map((chapter) => ({
          title: chapter.title,
          role: roleOf(chapter),
          startParagraphIndex: chapter.paragraphs[0].paragraphIndex,
        })),
    });
  };

  if (isLoading) return <p style={{ margin: 0, color: 'var(--fg-muted)' }}>讀取章節中…</p>;
  if (error) {
    return (
      <p role="alert" style={{ margin: 0, color: 'var(--color-error)' }}>
        讀不到審閱資料：{error instanceof ApiError ? error.detail : String(error)}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
        系統偵測到 {chapters.length} 段（{bodyCount} 章正文）。非正文的章節不進分析，但會保留。
        確認後才開始抽取，會消耗 token。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
          <thead>
            <tr style={{ color: 'var(--fg-muted)' }}>
              <th style={cellStyle}>#</th>
              <th style={cellStyle}>標題</th>
              <th style={cellStyle}>角色</th>
              <th style={{ ...cellStyle, textAlign: 'right' }}>段數</th>
              <th style={cellStyle}>開頭</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((chapter) => (
              <tr key={chapter.chapterIdx}>
                <td style={{ ...cellStyle, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {chapter.chapterIdx + 1}
                </td>
                <td style={{ ...cellStyle, fontFamily: 'var(--font-serif)' }}>{chapter.title ?? '（無標題）'}</td>
                <td style={cellStyle}>
                  <select
                    aria-label={`第 ${chapter.chapterIdx + 1} 段的角色`}
                    value={roleOf(chapter)}
                    onChange={(event) =>
                      setRoles((prev) => ({ ...prev, [chapter.chapterIdx]: event.target.value }))
                    }
                    style={{
                      font: 'inherit',
                      color: 'var(--fg-primary)',
                      background: 'var(--bg-primary)',
                      border: 'var(--border-width) var(--border-style) var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 'var(--space-1) var(--space-2)',
                    }}
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {chapter.paragraphs.length}
                </td>
                <td style={{ ...cellStyle, color: 'var(--fg-secondary)', maxWidth: 420 }}>
                  {chapter.paragraphs[0]?.text.slice(0, 60) ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {submit.error && (
        <p role="alert" style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>
          送出失敗：{submit.error instanceof ApiError ? submit.error.detail : String(submit.error)}
        </p>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm"
          disabled={submit.isPending || bodyCount === 0}
          onClick={send}
        >
          {changed ? '套用並開始抽取' : '接受系統判斷，開始抽取'}
        </button>
        {changed && (
          <button
            type="button"
            className="ss-btn ss-btn-md ss-btn-ghost"
            disabled={submit.isPending}
            onClick={() => setRoles({})}
          >
            還原
          </button>
        )}
      </div>
    </div>
  );
}
