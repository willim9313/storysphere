import { useMemo } from 'react';

interface KeywordTagsProps {
  /** keywords as string[] (chunk) or Record<string, number> (chapter/book) */
  keywords: string[] | Record<string, number>;
  /** max tags to display */
  limit?: number;
}

/** Render keyword tags sorted by score (highest first). */
export function KeywordTags({ keywords, limit = 10 }: KeywordTagsProps) {
  const sorted = useMemo(() => {
    if (Array.isArray(keywords)) {
      return keywords.slice(0, limit);
    }
    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([k]) => k);
  }, [keywords, limit]);

  if (sorted.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map((kw) => (
        <span key={kw} className="kw-tag">
          {kw}
        </span>
      ))}
    </div>
  );
}
