import { useTranslation } from 'react-i18next';
import type { EventAnalysisDetail } from '@/api/types';
import { AnalysisAccordion } from './AnalysisAccordion';

type TFunc = (key: string, opts?: object) => string;

function buildSections(data: EventAnalysisDetail, t: TFunc) {
  const sections: { title: string; subtitle?: string; content: string }[] = [];

  const roleLabel = (role: string) => t(`event.roles.${role}`) || role;
  const importanceLabel = (imp: string) => t(`event.importance.${imp}`) || imp;

  if (data.summary?.summary) {
    sections.push({ title: t('event.sections.summary'), content: data.summary.summary });
  }

  const { eep } = data;
  if (eep.stateBefore || eep.stateAfter) {
    const lines: string[] = [];
    if (eep.stateBefore) lines.push(`**${t('event.sections.stateBefore')}：** ${eep.stateBefore}`);
    if (eep.stateAfter) lines.push(`\n**${t('event.sections.stateAfter')}：** ${eep.stateAfter}`);
    if (eep.structuralRole) lines.push(`\n**${t('event.sections.structuralRole')}：** ${eep.structuralRole}`);
    if (eep.eventImportance) lines.push(`**${t('event.sections.importance')}：** ${importanceLabel(eep.eventImportance)}`);
    if (eep.thematicSignificance) lines.push(`\n**${t('event.sections.thematicSignificance')}：** ${eep.thematicSignificance}`);
    sections.push({ title: t('event.sections.stateChange'), content: lines.join('\n') });
  }

  if (eep.participantRoles.length) {
    const lines = eep.participantRoles.map((p) => {
      const role = roleLabel(p.role);
      return `- **${p.entityName}**（${role}）：${p.impactDescription}`;
    });
    sections.push({ title: t('event.sections.participantRoles'), content: lines.join('\n') });
  }

  const { causality } = data;
  if (causality.rootCause || causality.causalChain.length) {
    const lines: string[] = [];
    if (causality.rootCause) lines.push(`**${t('event.sections.rootCause')}：** ${causality.rootCause}`);
    if (causality.causalChain.length) {
      lines.push(`\n**${t('event.sections.causalChain')}：**`);
      causality.causalChain.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    }
    if (causality.chainSummary) lines.push(`\n${causality.chainSummary}`);
    sections.push({ title: t('event.sections.causality'), content: lines.join('\n') });
  }

  const { impact } = data;
  if (impact.impactSummary || impact.participantImpacts.length || impact.relationChanges.length) {
    const lines: string[] = [];
    if (impact.impactSummary) lines.push(impact.impactSummary);
    if (impact.participantImpacts.length) {
      lines.push(`\n**${t('event.sections.participantImpacts')}：**`);
      impact.participantImpacts.forEach((p) => lines.push(`- ${p}`));
    }
    if (impact.relationChanges.length) {
      lines.push(`\n**${t('event.sections.relationChanges')}：**`);
      impact.relationChanges.forEach((r) => lines.push(`- ${r}`));
    }
    sections.push({ title: t('event.sections.impact'), content: lines.join('\n') });
  }

  if (eep.causalFactors.length) {
    sections.push({
      title: t('event.sections.causalFactors'),
      content: eep.causalFactors.map((f) => `- ${f}`).join('\n'),
    });
  }

  if (eep.consequences.length) {
    sections.push({
      title: t('event.sections.consequences'),
      content: eep.consequences.map((c) => `- ${c}`).join('\n'),
    });
  }

  if (eep.keyQuotes.length) {
    sections.push({
      title: t('event.sections.keyQuotes'),
      content: eep.keyQuotes.map((q) => `> ${q}`).join('\n\n'),
    });
  }

  return sections;
}

interface Props {
  data: EventAnalysisDetail;
}

export function EventAnalysisDetail({ data }: Props) {
  const { t } = useTranslation('analysis');
  return <AnalysisAccordion sections={buildSections(data, t)} />;
}
