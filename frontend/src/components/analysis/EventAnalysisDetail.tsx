import type { EventAnalysisDetail } from '@/api/types';
import { AnalysisAccordion } from './AnalysisAccordion';

const ROLE_LABELS: Record<string, string> = {
  initiator: '發起者',
  actor: '行動者',
  reactor: '反應者',
  victim: '受害者',
  beneficiary: '受益者',
};

const IMPORTANCE_LABELS: Record<string, string> = {
  kernel: '核心事件',
  satellite: '衛星事件',
};

function buildSections(data: EventAnalysisDetail) {
  const sections: { title: string; subtitle?: string; content: string }[] = [];

  // Summary
  if (data.summary?.summary) {
    sections.push({ title: '事件摘要', content: data.summary.summary });
  }

  // EEP — state before/after
  const { eep } = data;
  if (eep.stateBefore || eep.stateAfter) {
    const lines: string[] = [];
    if (eep.stateBefore) lines.push(`**事件前：** ${eep.stateBefore}`);
    if (eep.stateAfter) lines.push(`\n**事件後：** ${eep.stateAfter}`);
    if (eep.structuralRole) lines.push(`\n**結構角色：** ${eep.structuralRole}`);
    if (eep.eventImportance) lines.push(`**重要性：** ${IMPORTANCE_LABELS[eep.eventImportance] ?? eep.eventImportance}`);
    if (eep.thematicSignificance) lines.push(`\n**主題意義：** ${eep.thematicSignificance}`);
    sections.push({ title: '事件前後狀態', content: lines.join('\n') });
  }

  // Participant roles
  if (eep.participantRoles.length) {
    const lines = eep.participantRoles.map((p) => {
      const role = ROLE_LABELS[p.role] ?? p.role;
      return `- **${p.entityName}**（${role}）：${p.impactDescription}`;
    });
    sections.push({ title: '參與者角色', content: lines.join('\n') });
  }

  // Causality
  const { causality } = data;
  if (causality.rootCause || causality.causalChain.length) {
    const lines: string[] = [];
    if (causality.rootCause) lines.push(`**根本原因：** ${causality.rootCause}`);
    if (causality.causalChain.length) {
      lines.push('\n**因果鏈：**');
      causality.causalChain.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    }
    if (causality.chainSummary) lines.push(`\n${causality.chainSummary}`);
    sections.push({ title: '因果分析', content: lines.join('\n') });
  }

  // Impact
  const { impact } = data;
  if (impact.impactSummary || impact.participantImpacts.length || impact.relationChanges.length) {
    const lines: string[] = [];
    if (impact.impactSummary) lines.push(impact.impactSummary);
    if (impact.participantImpacts.length) {
      lines.push('\n**角色影響：**');
      impact.participantImpacts.forEach((p) => lines.push(`- ${p}`));
    }
    if (impact.relationChanges.length) {
      lines.push('\n**關係變化：**');
      impact.relationChanges.forEach((r) => lines.push(`- ${r}`));
    }
    sections.push({ title: '影響分析', content: lines.join('\n') });
  }

  // Causal factors
  if (eep.causalFactors.length) {
    sections.push({
      title: '促成因素',
      content: eep.causalFactors.map((f) => `- ${f}`).join('\n'),
    });
  }

  // Consequences
  if (eep.consequences.length) {
    sections.push({
      title: '後續影響',
      content: eep.consequences.map((c) => `- ${c}`).join('\n'),
    });
  }

  // Key quotes
  if (eep.keyQuotes.length) {
    sections.push({
      title: '關鍵引言',
      content: eep.keyQuotes.map((q) => `> ${q}`).join('\n\n'),
    });
  }

  return sections;
}

interface Props {
  data: EventAnalysisDetail;
}

export function EventAnalysisDetail({ data }: Props) {
  return <AnalysisAccordion sections={buildSections(data)} />;
}
