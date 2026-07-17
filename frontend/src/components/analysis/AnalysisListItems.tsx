import { useTranslation } from 'react-i18next';
import type { AnalysisItem, UnanalyzedEntity } from '@/api/types';
import { avatarStyle } from './entityAvatarStyle';

/** Design canvas formula: width% = 6 + 94 * sqrt(mentions / max) */
function mentionBarWidth(mentions: number, max: number): number {
  if (max <= 0) return 6;
  return 6 + 94 * Math.sqrt(Math.max(0, mentions) / max);
}

export function AnalyzedItem({
  item,
  framework,
  isSelected,
  onSelect,
  maxMentionCount,
  itemId,
}: {
  item: AnalysisItem;
  framework: string;
  isSelected: boolean;
  onSelect: () => void;
  maxMentionCount?: number;
  itemId?: string;
}) {
  const { t } = useTranslation('analysis');
  const archetypeLabel = item.archetypes?.[framework];
  return (
    <button
      id={itemId}
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
          <span>{t('character.list.mentionCount', { count: item.mentionCount })}</span>
        </div>
        {maxMentionCount !== undefined && (
          <div className="ca-item-mentionbar">
            <div
              className="ca-item-mentionbar-fill"
              style={{ width: `${mentionBarWidth(item.mentionCount, maxMentionCount)}%` }}
            />
          </div>
        )}
      </div>
      <div
        className="ca-item-dot"
        style={item.status === 'partial' ? { background: 'var(--color-warning)' } : undefined}
      />
    </button>
  );
}

export function UnanalyzedItem({
  item,
  isSelected,
  onSelect,
  onGenerate,
  isGenerating,
  maxMentionCount,
  itemId,
}: {
  item: UnanalyzedEntity;
  isSelected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  maxMentionCount?: number;
  itemId?: string;
}) {
  const { t } = useTranslation('analysis');

  return (
    <div
      id={itemId}
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
          <span>· {t('character.list.mentionCount', { count: item.mentionCount })}</span>
        </div>
        {maxMentionCount !== undefined && (
          <div className="ca-item-mentionbar">
            <div
              className="ca-item-mentionbar-fill muted"
              style={{ width: `${mentionBarWidth(item.mentionCount, maxMentionCount)}%` }}
            />
          </div>
        )}
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
