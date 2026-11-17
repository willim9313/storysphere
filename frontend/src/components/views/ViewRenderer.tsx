import type { ComponentType } from 'react';
import type { ViewProps } from './types';
import { CausalGraphView } from './CausalGraphView';
import { CharacterArcView } from './CharacterArcView';
import { EvidenceListView } from './EvidenceListView';
import { KnowledgeMatrixView } from './KnowledgeMatrixView';
import { NetworkView } from './NetworkView';

// 05 §4.1：原型先做有資料的 5 種；其他的退回 evidence_list。
const VIEWS: Record<string, ComponentType<ViewProps>> = {
  evidence_list: EvidenceListView,
  knowledge_matrix: KnowledgeMatrixView,
  character_arc: CharacterArcView,
  causal_graph: CausalGraphView,
  network: NetworkView,
};

export function ViewRenderer({ viewType, ...props }: Readonly<ViewProps & { viewType: string | null }>) {
  const View = (viewType && VIEWS[viewType]) || EvidenceListView;
  return <View {...props} />;
}
