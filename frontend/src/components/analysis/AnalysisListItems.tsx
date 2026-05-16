import { useTranslation } from 'react-i18next';
import type { AnalysisItem, UnanalyzedEntity } from '@/api/types';

const AVATAR_PALETTES = ['char', 'loc', 'org', 'obj', 'con', 'evt'] as const;

function avatarStyle(seed: string): React.CSSProperties {
  const code = seed.length > 0 ? seed.charCodeAt(0) : 0;
  const p = AVATAR_PALETTES[code % AVATAR_PALETTES.length];
  return {
    background: `var(--entity-${p}-bg)`,
    color: `var(--entity-${p}-fg)`,
    border: `1px solid var(--entity-${p}-border)`,
  };
}

export function AnalyzedItem({
  item,
  framework,
  isSelected,
  onSelect,
}: {
  item: AnalysisItem;
  framework: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation('analysis');
  const archetypeLabel = item.archetypes?.[framework];
  return (
    <button
      type="button"
      className={'ca-item' + (isSelected ? ' selected' : '')}
      onClick={onSelect}
    >
      <div className="ca-avatar" style={avatarStyle(item.title)}>
        {item.title[0]}
      </div>
      <div className="ca-item-body">
        <div className="ca-item-row">
          <span className="ca-item-name">{item.title}</span>
        </div>
        {archetypeLabel && <div className="ca-item-archetype">{archetypeLabel}</div>}
        <div className="ca-item-meta">
          <span>{t('list.chapterCount', { count: item.chapterCount })}</span>
        </div>
      </div>
      <div className="ca-item-dot" />
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
  const { t } = useTranslation('analysis');

  return (
    <div
      className={'ca-item' + (isSelected ? ' selected' : '')}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="ca-avatar muted">{item.name[0]}</div>
      <div className="ca-item-body">
        <div className="ca-item-row">
          <span className="ca-item-name muted">{item.name}</span>
        </div>
        <div className="ca-item-meta">
          <span>{t('notAnalyzed')}</span>
          <span>· {t('list.chapterCount', { count: item.chapterCount })}</span>
        </div>
      </div>
      <button
        type="button"
        className="ca-item-mini-btn"
        onClick={(e) => {
          e.stopPropagation();
          onGenerate();
        }}
        disabled={isGenerating}
      >
        {isGenerating ? '…' : t('generate')}
      </button>
    </div>
  );
}
