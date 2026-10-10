import { useTranslation } from 'react-i18next';
import type { AnalysisItem, UnanalyzedEntity } from '@/api/types';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * 左欄事件列（動作列·行內按鈕變體，DS v3 第 3 批 · 10）。
 *   一行格線：24px 徽章 · 1fr 本文 · 12px 狀態點；第二行固定 28px（章號、敘事 chip、「生成分析」）。
 *   狀態點與按鈕二擇一：已分析列有點，未分析列有按鈕（無點的列 body 併入點欄）。
 *   剛完成的列不整列高亮，只由狀態點轉 success 表達。
 */

export type NarrativeMode = 'present' | 'flashback' | 'flashforward' | 'parallel' | 'unknown';

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

export function NarrativeChip({ mode }: Readonly<{ mode: NarrativeMode }>) {
  const { t } = useTranslation('analysis');
  // present mode = dominant case, don't display chip
  if (mode === 'present') return null;
  return <span className={'ea-narr ' + mode}>{t(NARRATIVE_KEYS[mode])}</span>;
}

export function ImportanceBadge({
  importance,
  analyzed = true,
}: Readonly<{ importance: string | null; analyzed?: boolean }>) {
  const { t } = useTranslation('analysis');
  if (importance === 'KERNEL') {
    return (
      <Tooltip label={t('event.importance.kernel')}>
        <span className="ea-imp kernel">{t('event.list.kernelAbbr')}</span>
      </Tooltip>
    );
  }
  if (importance === 'SATELLITE') {
    return (
      <Tooltip label={t('event.importance.satellite')}>
        <span className="ea-imp satellite">{t('event.list.satelliteAbbr')}</span>
      </Tooltip>
    );
  }
  // Undetermined: the dotted "·" has no label of its own (it used to carry a
  // native title of "·", which said nothing); unanalyzed rows explain it.
  if (!analyzed) {
    return (
      <Tooltip label={t('notAnalyzed')}>
        <span className="ea-imp unknown">·</span>
      </Tooltip>
    );
  }
  return <span className="ea-imp unknown">·</span>;
}

function RowMeta({
  chapter,
  mode,
  stale,
  children,
}: Readonly<{
  chapter: number | null;
  mode: NarrativeMode | null;
  stale?: boolean;
  children?: React.ReactNode;
}>) {
  const { t } = useTranslation('analysis');
  return (
    <span className="ea-row-meta">
      {chapter !== null && <span>{t('event.list.chapterShort', { n: chapter })}</span>}
      {mode && mode !== 'present' && (
        <>
          <span className="dot" />
          <NarrativeChip mode={mode} />
        </>
      )}
      {stale && (
        <Tooltip label={t('event.stale.tooltip')}>
          <span className="ea-row-stale" role="img" aria-label={t('event.stale.tooltip')} />
        </Tooltip>
      )}
      {children}
    </span>
  );
}

function activateOnKey(onSelect: () => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    // The inline 生成分析 button handles its own keys; only react to the row itself.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };
}

export function EventAnalyzedItem({
  item,
  isSelected,
  onSelect,
  justDone,
}: Readonly<{
  item: AnalysisItem;
  isSelected: boolean;
  onSelect: () => void;
  justDone?: boolean;
}>) {
  const { t } = useTranslation('analysis');
  const mode = normalizeNarrative(item.narrativeMode);
  const partial = item.status === 'partial';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={activateOnKey(onSelect)}
      className={'ea-row' + (isSelected ? ' selected' : '')}
    >
      <ImportanceBadge importance={item.importance ?? null} />
      <span className="ea-row-body">
        <span className="ea-row-name">{item.title}</span>
        <RowMeta chapter={item.chapter ?? null} mode={mode} stale={item.isStale} />
      </span>
      {partial ? (
        <Tooltip label={t('event.partialBadge')}>
          <span className="ea-row-dot partial" role="img" aria-label={t('event.partialBadge')} />
        </Tooltip>
      ) : (
        <span className={'ea-row-dot' + (justDone ? ' is-just-done' : '')} />
      )}
    </div>
  );
}

export function EventUnanalyzedItem({
  item,
  isSelected,
  onSelect,
  onGenerate,
  isGenerating,
  failed,
  failureReason,
  generateBlockedReason = null,
}: Readonly<{
  item: UnanalyzedEntity;
  isSelected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  /** The last batch run failed on this one: marked with a diamond dot (shape,
   *  not hue — Ink has one colour for every status). */
  failed?: boolean;
  /** Set only while the list is narrowed to failures (「只看失敗」): the second line then
   *  reads 「第 n 章 · <reason>」 instead of the chapter / chip / 生成分析 line (10 提案 D 區). */
  failureReason?: string;
  /** Why 「生成分析」 cannot start right now; null = it can. */
  generateBlockedReason?: string | null;
}>) {
  const { t } = useTranslation('analysis');
  const mode = normalizeNarrative(item.narrativeMode);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={activateOnKey(onSelect)}
      className={
        'ea-row pending' +
        (isGenerating ? ' is-generating' : '') +
        (failed && !isGenerating ? ' is-failed' : '') +
        (isSelected ? ' selected' : '')
      }
    >
      <ImportanceBadge importance={null} analyzed={false} />
      <span className="ea-row-body">
        <span className="ea-row-name">{item.name}</span>
        {failureReason !== undefined ? (
          <span className="ea-row-meta ea-row-fail-reason">
            {item.chapter != null && (
              <>
                <span className="ea-row-fail-where">
                  {t('batch.failures.chapter', { chapter: item.chapter })}
                </span>
                <span className="dot" />
              </>
            )}
            <code className="ea-row-fail-text">{failureReason}</code>
          </span>
        ) : (
        <RowMeta chapter={item.chapter ?? null} mode={mode}>
          {!isGenerating && (
            <Tooltip label={generateBlockedReason ?? ''} disabled={!generateBlockedReason}>
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm ea-row-create"
                disabled={!!generateBlockedReason}
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate();
                }}
              >
                {t('generate')}
              </button>
            </Tooltip>
          )}
        </RowMeta>
        )}
      </span>
      {isGenerating && <span className="ea-row-dot running" />}
      {failed && !isGenerating && (
        <Tooltip label={t('batch.stat.failed')}>
          <span className="ea-row-dot failed" role="img" aria-label={t('batch.stat.failed')} />
        </Tooltip>
      )}
    </div>
  );
}
