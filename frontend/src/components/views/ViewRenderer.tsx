import type { ComponentType } from 'react';
import type { ViewProps } from './types';
import { CausalGraphView } from './CausalGraphView';
import { CharacterArcView } from './CharacterArcView';
import { EvidenceListView } from './EvidenceListView';
import { FairnessMatrixView } from './FairnessMatrixView';
import { KnowledgeMatrixView } from './KnowledgeMatrixView';
import { NetworkView } from './NetworkView';

// 05 §4.1：原型做有資料的 6 種（fairness_matrix 在 MY4 之後補上）；其他的退回 evidence_list。
const VIEWS: Record<string, ComponentType<ViewProps>> = {
  evidence_list: EvidenceListView,
  knowledge_matrix: KnowledgeMatrixView,
  character_arc: CharacterArcView,
  causal_graph: CausalGraphView,
  network: NetworkView,
  fairness_matrix: FairnessMatrixView,
};

export function ViewRenderer({ viewType, ...props }: Readonly<ViewProps & { viewType: string | null }>) {
  const View = (viewType && VIEWS[viewType]) || EvidenceListView;
  return <View {...props} />;
}
