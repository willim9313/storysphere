import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCharacterMetrics } from '@/hooks/useCharacterMetrics';
import { useFactions } from '@/hooks/useFactions';

interface Props {
  bookId: string;
  entityId: string;
  name: string;
  mentionCount: number;
  onGenerate: () => void;
  generating: boolean;
}

const FACTION_NAMES_SHOWN = 2;

/**
 * Detail pane for a character with no deep analysis yet (UI_SPEC §3.4, CA-5).
 *
 * Shows what is already known for free — mentions (#6a), relation count (#6e
 * degree), faction (#6d) — and what generating will produce, before the one
 * token-spending button. Both queries are already loaded by the overview, so
 * this adds no requests.
 */
export function UnanalyzedCharacterDetail({
  bookId,
  entityId,
  name,
  mentionCount,
  onGenerate,
  generating,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const { data: metrics } = useCharacterMetrics(bookId);
  const { data: factions } = useFactions(bookId);

  const degree = metrics?.metrics?.find((m) => m.entityId === entityId)?.degree;

  let factionText = '—';
  if (factions) {
    const faction = factions.factions?.find((f) => f.memberIds?.includes(entityId));
    if (!faction) {
      factionText = t('character.unanalyzed.noFaction');
    } else {
      const others = (faction.topMemberNames ?? []).filter((n) => n !== name).slice(0, FACTION_NAMES_SHOWN);
      const rest = (faction.memberIds?.length ?? 0) - 1 - others.length;
      factionText =
        others.length === 0
          ? t('character.unanalyzed.factionSize', { count: faction.memberIds?.length ?? 0 })
          : t(rest > 0 ? 'character.unanalyzed.factionWithMore' : 'character.unanalyzed.factionWith', {
              names: others.join(t('character.unanalyzed.nameJoiner')),
              rest,
              // zh counts everyone else in the faction, en counts only the unnamed rest.
              others: others.length + rest,
            });
    }
  }

  return (
    <div className="ca-unanalyzed">
      <div className="ca-unanalyzed-head">
        <h1 className="ca-title">{name}</h1>
        <Link to={`/books/${bookId}/graph?entity=${entityId}`} className="ca-unanalyzed-graph">
          {t('viewInGraph')} <ExternalLink size={11} />
        </Link>
      </div>

      <div className="ca-unanalyzed-stats">
        <div className="ca-voice-stat">
          <span className="ca-voice-stat-value">{mentionCount}</span>
          <span className="ca-voice-stat-label">{t('character.unanalyzed.mentions')}</span>
        </div>
        <div className="ca-voice-stat">
          <span className="ca-voice-stat-value">{degree ?? '—'}</span>
          <span className="ca-voice-stat-label">{t('character.unanalyzed.relations')}</span>
        </div>
        <div className="ca-voice-stat ca-unanalyzed-faction">
          <span className="ca-unanalyzed-faction-text">{factionText}</span>
          <span className="ca-voice-stat-label">{t('character.unanalyzed.faction')}</span>
        </div>
      </div>

      <div className="ca-unanalyzed-body">
        <p className="ca-unanalyzed-lead">{t('character.unanalyzed.lead')}</p>
        <ul className="ca-unanalyzed-list">
          <li>{t('character.unanalyzed.yields.persona')}</li>
          <li>{t('character.unanalyzed.yields.behavior')}</li>
          <li>{t('character.unanalyzed.yields.relations')}</li>
          <li>{t('character.unanalyzed.yields.arc')}</li>
        </ul>
        <p className="ca-unanalyzed-note">{t('character.unanalyzed.later')}</p>
        <div className="ca-unanalyzed-action">
          <button
            type="button"
            className="ss-btn ss-btn-md ss-btn-primary ss-btn-llm"
            onClick={onGenerate}
            disabled={generating}
          >
            {t('character.unanalyzed.create')}
          </button>
          <span className="ca-unanalyzed-cost">{t('tension.state.tokenHintShort')}</span>
        </div>
      </div>
    </div>
  );
}
