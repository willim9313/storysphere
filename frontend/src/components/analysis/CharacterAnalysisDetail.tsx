import type { CharacterAnalysisDetail } from '@/api/types';
import { AnalysisAccordion } from './AnalysisAccordion';

function confidenceLabel(c: number): string {
  if (c >= 0.8) return '高';
  if (c >= 0.5) return '中';
  return '低';
}

function buildSections(data: CharacterAnalysisDetail) {
  const sections: { title: string; subtitle?: string; content: string }[] = [];

  // Profile summary
  if (data.profileSummary) {
    sections.push({ title: '角色簡介', content: data.profileSummary });
  }

  // Archetypes
  for (const a of data.archetypes) {
    const frameworkLabel = a.framework === 'jung' ? 'Jung 12 原型' : 'Schmidt 45 原型';
    const primary = a.primary;
    const secondary = a.secondary ? `，次要：**${a.secondary}**` : '';
    const confidence = `信心度：${confidenceLabel(a.confidence)}（${Math.round(a.confidence * 100)}%）`;
    const evidenceLines = a.evidence.length
      ? '\n\n**依據：**\n' + a.evidence.map((e) => `- ${e}`).join('\n')
      : '';
    sections.push({
      title: frameworkLabel,
      subtitle: primary,
      content: `**主要原型：${primary}**${secondary}\n\n${confidence}${evidenceLines}`,
    });
  }

  // Traits
  if (data.cep?.traits.length) {
    sections.push({
      title: '個性特質',
      content: data.cep.traits.map((t) => `- ${t}`).join('\n'),
    });
  }

  // Actions
  if (data.cep?.actions.length) {
    sections.push({
      title: '主要行動',
      content: data.cep.actions.map((a) => `- ${a}`).join('\n'),
    });
  }

  // Relations
  if (data.cep?.relations.length) {
    const lines = data.cep.relations.map((r) => {
      const target = r.target ?? r['targetName'] ?? '—';
      const type = r.type ?? '—';
      const desc = r.description ?? '';
      return `- **${target}**（${type}）${desc ? '：' + desc : ''}`;
    });
    sections.push({ title: '重要關係', content: lines.join('\n') });
  }

  // Key events
  if (data.cep?.keyEvents.length) {
    const lines = data.cep.keyEvents.map((ev) => {
      const eventName = (ev['event'] as string) ?? (ev['title'] as string) ?? (ev['name'] as string) ?? '—';
      const chapter = ev['chapter'] as string | undefined;
      const significance = (ev['significance'] as string) ?? (ev['description'] as string) ?? '';
      const chapterTag = chapter && chapter !== '未知' ? `（第 ${chapter} 章）` : '';
      const sigLine = significance ? '\n  ' + significance : '';
      return `- **${eventName}**${chapterTag}${sigLine}`;
    });
    sections.push({ title: '關鍵事件', content: lines.join('\n') });
  }

  // Quotes
  if (data.cep?.quotes.length) {
    sections.push({
      title: '代表引言',
      content: data.cep.quotes.map((q) => `> ${q}`).join('\n\n'),
    });
  }

  // Development arc
  if (data.arc.length) {
    const lines = data.arc.map(
      (seg) => `**第 ${seg.chapterRange} 章 — ${seg.phase}**\n\n${seg.description}`,
    );
    sections.push({ title: '發展弧線', content: lines.join('\n\n---\n\n') });
  }

  return sections;
}

interface Props {
  data: CharacterAnalysisDetail;
}

export function CharacterAnalysisDetail({ data }: Props) {
  return <AnalysisAccordion sections={buildSections(data)} />;
}
