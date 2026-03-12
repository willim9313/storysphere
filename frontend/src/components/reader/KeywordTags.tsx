interface KeywordTagsProps {
  keywords: Record<string, number> | null;
}

export function KeywordTags({ keywords }: KeywordTagsProps) {
  if (!keywords || Object.keys(keywords).length === 0) return null;

  const sorted = Object.entries(keywords)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {sorted.map(([word]) => (
        <span
          key={word}
          className="px-2 py-0.5 text-xs rounded-full"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-muted)',
          }}
        >
          {word}
        </span>
      ))}
    </div>
  );
}
