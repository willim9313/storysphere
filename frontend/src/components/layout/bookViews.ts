import {
  ScrollText,
  UserSearch,
  Flag,
  Mountain,
  Network,
  ChartGantt,
  Activity,
  Shapes,
  Layers,
  type LucideIcon,
} from 'lucide-react';

/**
 * The nine book-level views, in render order. One list feeds both the rail's
 * book group (icons) and the 28px breadcrumb's "current view" label, so the
 * two can never disagree about what a route is called.
 */
export interface BookView {
  /** Suffix after `/books/:bookId`; '' is the reader. */
  path: string;
  /** Key under `nav:tabs.*`. */
  labelKey: string;
  icon: LucideIcon;
}

export const BOOK_VIEWS: readonly BookView[] = [
  { path: '', labelKey: 'tabs.read', icon: ScrollText },
  { path: '/characters', labelKey: 'tabs.characterAnalysis', icon: UserSearch },
  { path: '/events', labelKey: 'tabs.eventAnalysis', icon: Flag },
  { path: '/narrative', labelKey: 'tabs.narrativeStructure', icon: Mountain },
  { path: '/graph', labelKey: 'tabs.knowledgeGraph', icon: Network },
  { path: '/timeline', labelKey: 'tabs.timeline', icon: ChartGantt },
  { path: '/tension', labelKey: 'tabs.tensionAnalysis', icon: Activity },
  { path: '/symbols', labelKey: 'tabs.symbolImagery', icon: Shapes },
  { path: '/unraveling', labelKey: 'tabs.unraveling', icon: Layers },
];
