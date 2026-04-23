import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail } from '@/api/types';
import { AnalysisAccordion } from './AnalysisAccordion';

type TFunc = (key: string, opts?: object) => string;

function confidenceLabel(c: number, t: TFunc): string {
  if (c >= 0.8) return t('character.confidenceHigh');
  if (c >= 0.5) return t('character.confidenceMid');
  return t('character.confidenceLow');
}

function buildSections(data: CharacterAnalysisDetail, t: TFunc) {
  const sections: { title: string; subtitle?: string; content: string }[] = [];

  if (data.profileSummary) {
    sections.push({ title: t('character.sections.profile'), content: data.profileSummary });
  }

  for (const a of data.archetypes) {
    const frameworkLabel = a.framework === 'jung'
      ? t('character.sections.jungArchetype')
      : t('character.sections.schmidtArchetype');
    const primary = a.primary;
    const secondary = a.secondary ? `，${t('character.secondaryArchetype')}：**${a.secondary}**` : '';
    const confidence = `${t('character.confidence')}：${confidenceLabel(a.confidence, t)}（${Math.round(a.confidence * 100)}%）`;
    const evidenceLines = a.evidence.length
      ? '\n\n**' + t('character.evidence') + '：**\n' + a.evidence.map((e) => `- ${e}`).join('\n')
      : '';
    sections.push({
      title: frameworkLabel,
      subtitle: primary,
      content: `**${t('character.primaryArchetype')}：${primary}**${secondary}\n\n${confidence}${evidenceLines}`,
    });
  }

  if (data.cep?.traits.length) {
    sections.push({
      title: t('character.sections.traits'),
      content: data.cep.traits.map((tr) => `- ${tr}`).join('\n'),
    });
  }

  if (data.cep?.actions.length) {
    sections.push({
      title: t('character.sections.actions'),
      content: data.cep.actions.map((a) => `- ${a}`).join('\n'),
    });
  }

  if (data.cep?.relations.length) {
    const lines = data.cep.relations.map((r) => {
      const target = r.target ?? (r as Record<string, unknown>)['targetName'] as string ?? '—';
      const type = r.type ?? '—';
      const desc = r.description ?? '';
      return `- **${target}**（${type}）${desc ? '：' + desc : ''}`;
    });
    sections.push({ title: t('character.sections.relations'), content: lines.join('\n') });
  }

  if (data.cep?.keyEvents.length) {
    const lines = data.cep.keyEvents.map((ev) => {
      const rec = ev as Record<string, unknown>;
      const eventName = (rec['event'] as string) ?? (rec['title'] as string) ?? (rec['name'] as string) ?? '—';
      const chapter = rec['chapter'] as string | undefined;
      const significance = (rec['significance'] as string) ?? (rec['description'] as string) ?? '';
      const chapterTag = chapter && chapter !== '未知' ? `（${t('character.chapter', { range: chapter })}）` : '';
      const sigLine = significance ? '\n  ' + significance : '';
      return `- **${eventName}**${chapterTag}${sigLine}`;
    });
    sections.push({ title: t('character.sections.keyEvents'), content: lines.join('\n') });
  }

  if (data.cep?.quotes.length) {
    sections.push({
      title: t('character.sections.quotes'),
      content: data.cep.quotes.map((q) => `> ${q}`).join('\n\n'),
    });
  }

  if (data.arc.length) {
    const lines = data.arc.map(
      (seg) => `**${t('character.chapter', { range: seg.chapterRange })} — ${seg.phase}**\n\n${seg.description}`,
    );
    sections.push({ title: t('character.sections.arc'), content: lines.join('\n\n---\n\n') });
  }

  return sections;
}

interface Props {
  data: CharacterAnalysisDetail;
}

export function CharacterAnalysisDetail({ data }: Props) {
  const { t } = useTranslation('analysis');
  return <AnalysisAccordion sections={buildSections(data, t)} />;
}
