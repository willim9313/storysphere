// Hero's Journey — stage detail panel.
//
// One panel for all four layouts. It never scrolls inside itself and has no
// height cap: the layout puts it in a sticky column (`.nl-detail`), so it
// follows the page rather than being squeezed into the card.
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { HeroJourneyStage } from '@/api/narrative';
import type { StageTheory } from './heroJourney';
import { formatChapters, stageOrdinal, stagePhase, stageState } from './heroJourney';
import { ConfidenceMeter, StateBadge } from './atoms';
import {
  confidenceSpan,
  lowConfidenceCount,
  repEmptyReason,
  resolveRepEvents,
  stagesSharingRange,
} from './narrativeModel';

export interface EventInfo {
  title: string;
  chapter?: number;
  significance?: string;
}

interface StageDetailProps {
  stage: HeroJourneyStage;
  theory: Record<string, StageTheory>;
  events: Record<string, EventInfo>;
  /** Every stage on the book — peers for the confidence range and shared-range detection. */
  allStages: HeroJourneyStage[];
  bookId?: string;
  /** Chapter of each kernel event (one per event) — decides which empty-state sentence is true. */
  kernelChapters: number[];
  /** Representative events laid out two to a row (track layout, full width). */
  wide?: boolean;
}

function Section({ label, extra, children }: { label: string; extra?: string; children: React.ReactNode }) {
  return (
    <div className="nl-sd-sec">
      <div className="nl-sd-sec-head">
        <span className="nl-sd-label">{label}</span>
        {extra && <span className="nl-sd-extra">{extra}</span>}
      </div>
      {children}
    </div>
  );
}

export function StageDetail({ stage, theory, events, allStages, bookId, kernelChapters, wide }: StageDetailProps) {
  const { t } = useTranslation('analysis');
  const phase = stagePhase(stage.stage_id);
  const st = stageState(stage);
  const def = theory[stage.stage_id];
  const name = def?.name ?? stage.stage_name;
  const range = stage.chapter_range;

  // Each id keeps its own event: a miss must not shift the links after it.
  const evs = resolveRepEvents(stage.representative_event_ids, events);

  // Stages covering exactly the same chapters resolve to the same events.
  const sharing = stagesSharingRange(stage, allStages);
  const span = confidenceSpan(allStages);
  const below = lowConfidenceCount(allStages);

  let emptyText = '';
  if (evs.length === 0) {
    const reason = repEmptyReason({ absent: st === 'absent', range, kernelChapters, sharingCount: sharing.length });
    const first = [...range].filter((c) => c > 0).sort((a, b) => a - b)[0] ?? 0;
    const last = kernelChapters.length ? Math.max(...kernelChapters) : 0;
    if (reason === 'noEvidence') emptyText = t('narrative.repEventsNoneAbsent');
    else if (reason === 'beyondKernel') emptyText = t('narrative.repEventsNoneRange', { ch: first, last });
    else if (reason === 'shared')
      emptyText = t('narrative.repEventsShared', { list: sharing.map((s) => stageOrdinal(s.stage_id)).join('、') });
    else emptyText = t('narrative.repEventsNoneGap', { ch: first });
  }

  return (
    <div className="nl-sd">
      <div className="nl-sd-top">
        <span className="nl-sd-phase">{t(`narrative.phase.${phase}`)}</span>
        <span className="nl-sd-chapters">· {formatChapters(range, t)}</span>
        <span className="nl-sd-spacer" />
        <StateBadge stage={stage} />
      </div>
      <h3 className="nl-sd-name">{name}</h3>

      {st !== 'absent' && (
        <>
          <ConfidenceMeter stage={stage} span={span} />
          <p className="nl-sd-note">
            {/* Without the branch this reads "this book has 0 of them" on every
                book whose stages all scored above the threshold. */}
            {below === 0 ? t('narrative.confNoteNone') : t('narrative.confNote', { below })}
          </p>
        </>
      )}

      {stage.notes && (
        <Section label={t('narrative.notes')}>
          <p className="nl-sd-body">{stage.notes}</p>
        </Section>
      )}

      <Section label={t('narrative.repEvents')} extra={evs.length ? t('narrative.evCount', { n: evs.length }) : undefined}>
        {sharing.length > 0 && evs.length > 0 && (
          <div className="nl-sd-shared">
            {t('narrative.repEventsShared', { list: sharing.map((s) => stageOrdinal(s.stage_id)).join('、') })}
          </div>
        )}
        {evs.length === 0 && <div className="nl-sd-empty">{emptyText}</div>}
        <div className={wide ? 'nl-sd-evs is-wide' : 'nl-sd-evs'}>
          {evs.map(({ id, ev }) => {
            const inner = (
              <>
                <div className="nl-sd-ev-top">
                  <span className="nl-sd-ev-ch">
                    {ev.chapter == null ? '' : t('narrative.spine.chapterUnit', { ch: ev.chapter })}
                  </span>
                  <span className="nl-sd-ev-title">{ev.title}</span>
                </div>
                {ev.significance && <div className="nl-sd-ev-sig">{ev.significance}</div>}
              </>
            );
            return bookId ? (
              <Link key={id} className="nl-sd-ev" to={`/books/${bookId}/events?event=${id}`}>
                {inner}
              </Link>
            ) : (
              <div key={id} className="nl-sd-ev">
                {inner}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Always open: the page's claim is that the interpretation is read
          against this theory, so it is not hidden behind a click. */}
      {def && (
        <div className="nl-sd-theory">
          <span className="nl-sd-label">{t('narrative.theoryLabel')}</span>
          <p className="nl-sd-body">{def.description}</p>
          <p className="nl-sd-body is-muted">
            {t('narrative.fnLabel')}
            {def.narrativeFunction}
          </p>
          <Link className="nl-sd-method" to="/methodology?framework=hero_journey">
            {t('narrative.methodLink')}
          </Link>
        </div>
      )}
    </div>
  );
}
