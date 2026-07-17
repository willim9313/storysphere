import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail } from '@/api/types';
import { PersonaPane } from './sections/PersonaPane';
import { BehaviorPane } from './sections/BehaviorPane';
import { RelationsPane } from './sections/RelationsPane';
import { ArcPane } from './sections/ArcPane';

type Framework = 'jung' | 'schmidt';
export type OverviewSubTab = 'persona' | 'behavior' | 'relations' | 'arc';

/** Name -> id lookup entry, used for #3/#5 name-based cross-linking (relations
 * pane target click-through, behavior pane key-event -> event page link). */
export interface NameIdEntry {
  name: string;
  id: string;
}

const SUB_TABS: OverviewSubTab[] = ['persona', 'behavior', 'relations', 'arc'];

interface Props {
  readonly data: CharacterAnalysisDetail;
  readonly framework: Framework;
  readonly subTab: OverviewSubTab;
  readonly onSubTabChange: (s: OverviewSubTab) => void;
  readonly onOpenCompare: () => void;
  readonly onRegenerate?: () => void;
  readonly isRegenerating?: boolean;
  readonly bookId: string;
  readonly chapterCount: number;
  readonly characterRoster: NameIdEntry[];
  readonly eventRoster: NameIdEntry[];
  readonly onSelectCharacter: (entityId: string) => void;
}

export function CharacterAnalysisDetail({
  data,
  framework,
  subTab,
  onSubTabChange,
  onOpenCompare,
  onRegenerate,
  isRegenerating = false,
  bookId,
  chapterCount,
  characterRoster,
  eventRoster,
  onSelectCharacter,
}: Props) {
  const { t } = useTranslation('analysis');

  return (
    <div>
      <div className="ca-subtabs" role="tablist">
        {SUB_TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={subTab === s}
            className={'ca-subtab' + (subTab === s ? ' active' : '')}
            onClick={() => onSubTabChange(s)}
          >
            {t(`character.subtabs.${s}`)}
          </button>
        ))}
      </div>

      {subTab === 'persona' && (
        <PersonaPane
          data={data}
          framework={framework}
          onOpenCompare={onOpenCompare}
          onRegenerate={onRegenerate}
          isRegenerating={isRegenerating}
        />
      )}
      {subTab === 'behavior' && (
        <BehaviorPane data={data} bookId={bookId} eventRoster={eventRoster} />
      )}
      {subTab === 'relations' && (
        <RelationsPane
          data={data}
          characterRoster={characterRoster}
          onSelectCharacter={onSelectCharacter}
        />
      )}
      {subTab === 'arc' && <ArcPane data={data} chapterCount={chapterCount} />}
    </div>
  );
}
