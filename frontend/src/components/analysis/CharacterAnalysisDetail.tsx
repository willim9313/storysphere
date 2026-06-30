import { useTranslation } from 'react-i18next';
import type { CharacterAnalysisDetail } from '@/api/types';
import { PersonaPane } from './sections/PersonaPane';
import { BehaviorPane } from './sections/BehaviorPane';
import { RelationsPane } from './sections/RelationsPane';
import { ArcPane } from './sections/ArcPane';

type Framework = 'jung' | 'schmidt';
export type OverviewSubTab = 'persona' | 'behavior' | 'relations' | 'arc';

const SUB_TABS: OverviewSubTab[] = ['persona', 'behavior', 'relations', 'arc'];

interface Props {
  readonly data: CharacterAnalysisDetail;
  readonly framework: Framework;
  readonly subTab: OverviewSubTab;
  readonly onSubTabChange: (s: OverviewSubTab) => void;
  readonly onOpenCompare: () => void;
  readonly onRegenerate?: () => void;
  readonly isRegenerating?: boolean;
}

export function CharacterAnalysisDetail({
  data,
  framework,
  subTab,
  onSubTabChange,
  onOpenCompare,
  onRegenerate,
  isRegenerating = false,
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
      {subTab === 'behavior' && <BehaviorPane data={data} />}
      {subTab === 'relations' && <RelationsPane data={data} />}
      {subTab === 'arc' && <ArcPane data={data} />}
    </div>
  );
}
