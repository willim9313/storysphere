import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail, ArchetypeDetail } from '@/api/types';
import { AnalysisAccordion } from './AnalysisAccordion';

type TFunc = (key: string, opts?: object) => string;
type Section = { title: string; subtitle?: string; content: string };

function confidenceLabel(c: number, t: TFunc): string {
  if (c >= 0.8) return t('character.confidenceHigh');
  if (c >= 0.5) return t('character.confidenceMid');
  return t('character.confidenceLow');
}

function archetypeSection(label: string, a: ArchetypeDetail | undefined, noData: string, t: TFunc): Section {
  if (!a) return { title: label, content: noData };
  const secondary = a.secondary ? `，${t('character.secondaryArchetype')}：**${a.secondary}**` : '';
  const confidence = `${t('character.confidence')}：${confidenceLabel(a.confidence, t)}（${Math.round(a.confidence * 100)}%）`;
  const evidenceLines = a.evidence.length
    ? '\n\n**' + t('character.evidence') + '：**\n' + a.evidence.map((e) => `- ${e}`).join('\n')
    : '';
  return {
    title: label,
    subtitle: a.primary,
    content: `**${t('character.primaryArchetype')}：${a.primary}**${secondary}\n\n${confidence}${evidenceLines}`,
  };
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

function buildSections(data: CharacterAnalysisDetail, t: TFunc): Section[] {
  const noData = t('character.noData');
  const archetypeMap = new Map(data.archetypes.map((a) => [a.framework, a]));

  return [
    { title: t('character.sections.profile'), content: data.profileSummary || noData },
    archetypeSection(t('character.sections.jungArchetype'), archetypeMap.get('jung'), noData, t),
    archetypeSection(t('character.sections.schmidtArchetype'), archetypeMap.get('schmidt'), noData, t),
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
}

export function CharacterAnalysisDetail({ data }: Props) {
  const { t } = useTranslation('analysis');
  return <AnalysisAccordion sections={buildSections(data, t)} />;
}
