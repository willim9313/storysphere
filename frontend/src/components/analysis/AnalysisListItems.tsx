import type { AnalysisItem, UnanalyzedEntity } from '@/api/types';

export function parseSections(content: string) {
  const sections: { title: string; content: string }[] = [];
  const parts = content.split(/^### /m).filter(Boolean);
  for (const part of parts) {
    const newline = part.indexOf('\n');
    if (newline === -1) continue;
    const title = part.slice(0, newline).trim();
    const body = part.slice(newline + 1).trim();
    if (body) sections.push({ title, content: body });
  }
  return sections.length > 0 ? sections : [{ title: '分析內容', content }];
}

export function AnalyzedItem({
  item,
  isSelected,
  onSelect,
}: {
  item: AnalysisItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors"
      style={{ backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent' }}
      onClick={onSelect}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
        style={{ backgroundColor: 'var(--entity-char-bg)', color: 'var(--entity-char-fg)' }}
      >
        {item.title[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--fg-primary)' }}>
          {item.title}
        </div>
        {item.archetypeType && (
          <div className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>
            {item.archetypeType}
          </div>
        )}
      </div>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--color-success)' }} />
    </button>
  );
}

export function UnanalyzedItem({
  item,
  isSelected,
  onSelect,
  onGenerate,
  isGenerating,
}: {
  item: UnanalyzedEntity;
  isSelected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 w-full rounded-md transition-colors"
      style={{ backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent' }}
    >
      <button
        className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 text-left"
        onClick={onSelect}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--fg-muted)' }}
        >
          {item.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>
            {item.name}
          </div>
          <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            尚未分析
          </div>
        </div>
      </button>
      <button
        className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 mr-2"
        style={{
          backgroundColor: isGenerating ? 'var(--bg-tertiary)' : 'var(--accent)',
          color: isGenerating ? 'var(--fg-muted)' : 'white',
        }}
        onClick={onGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? '…' : '建立'}
      </button>
    </div>
  );
}
