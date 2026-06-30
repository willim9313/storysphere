import { useTranslation } from 'react-i18next';
import type { AnalysisItem, UnanalyzedEntity } from '@/api/types';

type NarrativeMode = 'present' | 'flashback' | 'flashforward' | 'parallel' | 'unknown';

const NARRATIVE_KEYS: Record<NarrativeMode, string> = {
  present: 'event.narrative.present',
  flashback: 'event.narrative.flashback',
  flashforward: 'event.narrative.flashforward',
  parallel: 'event.narrative.parallel',
  unknown: 'event.narrative.unknown',
};

function normalizeNarrative(value: string | null | undefined): NarrativeMode | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === 'present' || v === 'flashback' || v === 'flashforward' || v === 'parallel' || v === 'unknown') {
    return v;
  }
  return null;
}

function NarrativeChip({ mode }: { mode: NarrativeMode }) {
  const { t } = useTranslation('analysis');
  // present mode = dominant case, don't display chip
  if (mode === 'present') return null;
  return <span className={'ea-narr ' + mode}>{t(NARRATIVE_KEYS[mode])}</span>;
}

function ImportanceBadge({ importance }: { importance: string | null }) {
  const { t } = useTranslation('analysis');
  if (importance === 'KERNEL') {
    return (
      <span className="ea-imp kernel" title={t('event.importance.kernel')}>
        {t('event.list.kernelAbbr')}
      </span>
    );
  }
  if (importance === 'SATELLITE') {
    return (
      <span className="ea-imp satellite" title={t('event.importance.satellite')}>
        {t('event.list.satelliteAbbr')}
      </span>
    );
  }
  return (
    <span className="ea-imp unknown" title="·">
      ·
    </span>
  );
}

export function EventAnalyzedItem({
  item,
  isSelected,
  onSelect,
  justDone,
  showImportance,
  showNarrative,
}: {
  item: AnalysisItem;
  isSelected: boolean;
  onSelect: () => void;
  justDone?: boolean;
  showImportance: boolean;
  showNarrative: boolean;
}) {
  const { t } = useTranslation('analysis');
  const mode = normalizeNarrative(item.narrativeMode);
  const chapter = item.chapter ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={'ea-item' + (isSelected ? ' selected' : '') + (justDone ? ' just-done' : '')}
    >
      {showImportance ? (
        <ImportanceBadge importance={item.importance ?? null} />
      ) : (
        <span className="ea-imp-spacer" />
      )}
      <span className="ea-item-body">
        <span className="ea-item-name">{item.title}</span>
        <span className="ea-item-meta">
          {chapter !== null && <span>{t('event.list.chapterShort', { n: chapter })}</span>}
          {showNarrative && mode && mode !== 'present' && (
            <>
              <span className="dot" />
              <NarrativeChip mode={mode} />
            </>
          )}
        </span>
      </span>
      <span className="ea-item-right">
        <span
          className="ea-item-dot"
          style={item.status === 'partial' ? { background: 'var(--color-warning)' } : undefined}
        />
      </span>
    </div>
  );
}

export function EventUnanalyzedItem({
  item,
  isSelected,
  onSelect,
  onGenerate,
  isGenerating,
  showImportance,
  showNarrative,
}: {
  item: UnanalyzedEntity;
  isSelected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  showImportance: boolean;
  showNarrative: boolean;
}) {
  const { t } = useTranslation('analysis');
  const mode = normalizeNarrative(item.narrativeMode);
  const chapter = item.chapter ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={'ea-item' + (isSelected ? ' selected' : '')}
    >
      {showImportance ? (
        <span className="ea-imp unknown" title={t('notAnalyzed')}>·</span>
      ) : (
        <span className="ea-imp-spacer" />
      )}
      <span className="ea-item-body">
        <span className="ea-item-name muted">{item.name}</span>
        <span className="ea-item-meta">
          {chapter !== null && <span>{t('event.list.chapterShort', { n: chapter })}</span>}
          {showNarrative && mode && mode !== 'present' && (
            <>
              <span className="dot" />
              <NarrativeChip mode={mode} />
            </>
          )}
        </span>
      </span>
      <span className="ea-item-right">
        {isGenerating ? (
          <span className="ea-item-dot running" />
        ) : (
          <button
            type="button"
            className="ea-item-mini-btn"
            onClick={(e) => {
              e.stopPropagation();
              onGenerate();
            }}
          >
            {t('generate')}
          </button>
        )}
      </span>
    </div>
  );
}
