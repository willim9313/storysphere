import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import type { CharacterAnalysisDetail, ArchetypeDetail } from '@/api/types';
import { AnalysisAccordion } from './AnalysisAccordion';

type TFunc = (key: string, opts?: object) => string;
type Section = { title: string; subtitle?: string; content: string };
type Framework = 'jung' | 'schmidt';

const FRAMEWORK_LABEL: Record<Framework, string> = {
  jung: 'Jung 12',
  schmidt: 'Schmidt 45',
};

function confidenceLabel(c: number, t: TFunc): string {
  if (c >= 0.8) return t('character.confidenceHigh');
  if (c >= 0.5) return t('character.confidenceMid');
  return t('character.confidenceLow');
}

function archetypeContent(a: ArchetypeDetail | undefined, missingText: string, t: TFunc): string {
  if (!a) return missingText;
  const secondary = a.secondary ? `，${t('character.secondaryArchetype')}：**${a.secondary}**` : '';
  const confidence = `${t('character.confidence')}：${confidenceLabel(a.confidence, t)}（${Math.round(a.confidence * 100)}%）`;
  const evidenceLines = a.evidence.length
    ? '\n\n**' + t('character.evidence') + '：**\n' + a.evidence.map((e) => `- ${e}`).join('\n')
    : '';
  return `**${t('character.primaryArchetype')}：${a.primary}**${secondary}\n\n${confidence}${evidenceLines}`;
}

function relationsContent(data: CharacterAnalysisDetail, noData: string): string {
  if (!data.cep?.relations.length) return noData;
  return data.cep.relations
    .map((r) => {
      const target = r.target ?? (r as Record<string, unknown>)['targetName'] as string ?? '—';
      const desc = r.description ?? '';
      return `- **${target}**（${r.type ?? '—'}）${desc ? '：' + desc : ''}`;
    })
    .join('\n');
}

function keyEventsContent(data: CharacterAnalysisDetail, noData: string, t: TFunc): string {
  if (!data.cep?.keyEvents.length) return noData;
  return data.cep.keyEvents
    .map((ev) => {
      const rec = ev as Record<string, unknown>;
      const eventName = (rec['event'] as string) ?? (rec['title'] as string) ?? (rec['name'] as string) ?? '—';
      const chapter = rec['chapter'] as string | undefined;
      const significance = (rec['significance'] as string) ?? (rec['description'] as string) ?? '';
      const chapterTag = chapter && chapter !== '未知' ? `（${t('character.chapter', { range: chapter })}）` : '';
      return `- **${eventName}**${chapterTag}${significance ? '\n  ' + significance : ''}`;
    })
    .join('\n');
}

function buildSections(
  data: CharacterAnalysisDetail,
  framework: Framework,
  archetypeMissing: boolean,
  t: TFunc,
): Section[] {
  const noData = t('character.noData');
  const archetypeMap = new Map(data.archetypes.map((a) => [a.framework, a]));
  const sectionLabel =
    framework === 'jung'
      ? t('character.sections.jungArchetype')
      : t('character.sections.schmidtArchetype');
  const missingText = archetypeMissing ? t('character.archetypeMissing') : noData;

  return [
    { title: t('character.sections.profile'), content: data.profileSummary || noData },
    {
      title: sectionLabel,
      subtitle: archetypeMap.get(framework)?.primary,
      content: archetypeContent(archetypeMap.get(framework), missingText, t),
    },
    {
      title: t('character.sections.traits'),
      content: data.cep?.traits.length ? data.cep.traits.map((tr) => `- ${tr}`).join('\n') : noData,
    },
    {
      title: t('character.sections.actions'),
      content: data.cep?.actions.length ? data.cep.actions.map((a) => `- ${a}`).join('\n') : noData,
    },
    { title: t('character.sections.relations'), content: relationsContent(data, noData) },
    { title: t('character.sections.keyEvents'), content: keyEventsContent(data, noData, t) },
    {
      title: t('character.sections.quotes'),
      content: data.cep?.quotes.length ? data.cep.quotes.map((q) => `> ${q}`).join('\n\n') : noData,
    },
    {
      title: t('character.sections.arc'),
      content: data.arc.length
        ? data.arc
            .map((seg) => `**${t('character.chapter', { range: seg.chapterRange })} — ${seg.phase}**\n\n${seg.description}`)
            .join('\n\n---\n\n')
        : noData,
    },
  ];
}

interface Props {
  readonly data: CharacterAnalysisDetail;
  readonly framework: Framework;
  readonly onFrameworkChange: (f: Framework) => void;
  readonly onRegenerate?: () => void;
  readonly isRegenerating?: boolean;
}

export function CharacterAnalysisDetail({
  data,
  framework,
  onFrameworkChange,
  onRegenerate,
  isRegenerating = false,
}: Props) {
  const { t } = useTranslation('analysis');
  const hasFrameworkResult = data.archetypes.some((a) => a.framework === framework);
  const archetypeMissing = !hasFrameworkResult;

  return (
    <div>
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-lg mb-3"
        style={{ backgroundColor: 'var(--bg-secondary)', width: 'fit-content' }}
      >
        {(['jung', 'schmidt'] as Framework[]).map((f) => (
          <button
            key={f}
            onClick={() => onFrameworkChange(f)}
            className="text-xs px-3 py-1 rounded-md transition-all"
            style={{
              backgroundColor: framework === f ? 'white' : 'transparent',
              color: framework === f ? 'var(--accent)' : 'var(--fg-muted)',
              fontWeight: framework === f ? 600 : 400,
            }}
          >
            {FRAMEWORK_LABEL[f]}
          </button>
        ))}
      </div>
      {archetypeMissing && onRegenerate && (
        <div
          className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-md"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {t('character.archetypeMissing')}
          </span>
          <button
            className="btn btn-secondary text-xs flex-shrink-0"
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            <RefreshCw size={12} />
            {t('regenerate')}
          </button>
        </div>
      )}
      <AnalysisAccordion sections={buildSections(data, framework, archetypeMissing, t)} />
    </div>
  );
}
