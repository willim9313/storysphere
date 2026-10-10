import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchEventQuoteSources } from '@/api/analysis';
import { qk } from '@/api/queryKeys';
import { EventContextTab } from './EventContextTab';
import { SourceJumpText } from './SourceJumpText';
import {
  causalityEmpty,
  causeTabEmpty,
  evidenceTabEmpty,
  factorsEmpty,
  impactEmpty,
} from './eventDetailModel';
import type {
  EventAnalysisDetail as EventAnalysisDetailType,
  ParticipantRole,
  CausalityAnalysis,
  ImpactAnalysis,
} from '@/api/types';

interface Props {
  data: EventAnalysisDetailType;
  causalVariant?: 'timeline' | 'stepped' | 'flat';
  showHero?: boolean;
  /** Enables the 上下文位置 tab, which needs book-level adjacency data. */
  bookId?: string;
  onSelectEvent?: (id: string) => void;
  /** Title row / meta / guidance ribbon — rendered above the tabs in one head block. */
  header?: ReactNode;
}

function EventHero({ data }: { data: EventAnalysisDetailType }) {
  const { t } = useTranslation('analysis');
  if (!data.eep.thematicSignificance && !data.summary?.summary) return null;
  return (
    <div className="ea-hero">
      {data.eep.thematicSignificance && (
        <div className="ea-hero-block">
          <span className="ea-label">{t('event.labels.thematicSignificance')}</span>
          <p className="ea-hero-thematic">{data.eep.thematicSignificance}</p>
        </div>
      )}
      {data.summary?.summary && (
        <div className="ea-hero-block">
          <span className="ea-label">{t('event.labels.summaryLabel')}</span>
          <p className="ea-hero-summary">{data.summary.summary}</p>
        </div>
      )}
    </div>
  );
}

function StateSection({ data }: { data: EventAnalysisDetailType }) {
  const { t } = useTranslation('analysis');
  const { eep } = data;
  if (!eep.stateBefore && !eep.stateAfter && !eep.structuralRole && !eep.eventImportance) {
    return null;
  }
  return (
    <div className="ea-state-block">
      <span className="ea-label">{t('event.sections.stateChange')}</span>
      {(eep.stateBefore || eep.stateAfter) && (
        <div className="ea-state-grid">
          <div className="ea-state before">
            <span className="ea-state-label">{t('event.labels.before')}</span>
            <p className="ea-state-text">{eep.stateBefore}</p>
          </div>
          <div className="ea-state-arrow" aria-hidden="true">
            <ArrowRight size={20} />
          </div>
          <div className="ea-state after">
            <span className="ea-state-label">{t('event.labels.after')}</span>
            <p className="ea-state-text">{eep.stateAfter}</p>
          </div>
        </div>
      )}
      {(eep.structuralRole || eep.eventImportance) && (
        <div className="ea-state-meta">
          {eep.structuralRole && (
            <div className="ea-state-meta-row">
              <span className="label">{t('event.sections.structuralRole')}</span>
              <span className="value">{eep.structuralRole}</span>
              {/* Borrowed screenwriting vocabulary, not the Chatman kernel/satellite
                  judgement sitting right next to it — say so right after the value
                  (not in a tooltip) so the two don't read as the same tier. */}
              <span className="hint">{t('event.sections.structuralRoleHint')}</span>
            </div>
          )}
          {eep.eventImportance && (
            <div className="ea-state-meta-row">
              <span className="label">{t('event.sections.importance')}</span>
              <span className="value plain">
                {eep.eventImportance === 'KERNEL'
                  ? t('event.importance.kernelTagline')
                  : t('event.importance.satelliteTagline')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One colour bucket per role the backend actually emits (observed values:
// initiator / actor / beneficiary). Previously `beneficiary` shared the muted
// `witness` bucket — reading "benefits from this event" as "merely watched it"
// — and initiator/actor were collapsed into one, losing who set the event in
// motion. `driver` / `witness` are the older coarse values, kept mapped so any
// legacy cached EEP still renders.
const ROLE_CLASS_MAP: Record<string, string> = {
  initiator: 'initiator',
  driver: 'initiator',
  actor: 'actor',
  reactor: 'reactor',
  victim: 'victim',
  beneficiary: 'beneficiary',
  witness: 'witness',
};

function roleClass(role: string): string {
  return ROLE_CLASS_MAP[role.toLowerCase()] ?? 'witness';
}

function roleLabel(role: string, t: ReturnType<typeof useTranslation>['t']): string {
  const lc = role.toLowerCase();
  const r2 = t(`event.roles2.${lc}`, { defaultValue: '' });
  if (r2) return r2;
  const r1 = t(`event.roles.${lc}`, { defaultValue: '' });
  return r1 || role;
}

function ParticipantCard({ p }: { p: ParticipantRole }) {
  const { t } = useTranslation('analysis');
  const cls = roleClass(p.role);
  const initial = p.entityName.charAt(0);
  return (
    <div className="ea-participant" data-role={cls}>
      <div className="ea-participant-avatar">{initial}</div>
      <div className="ea-participant-body">
        <div className="ea-participant-head">
          <span className="ea-participant-name">{p.entityName}</span>
          <span className="ea-participant-role">{roleLabel(p.role, t)}</span>
        </div>
        <p className="ea-participant-impact">{p.impactDescription}</p>
      </div>
    </div>
  );
}

/** Colour key for the role tags, listing only the roles this event actually
 *  uses — the backend emits a subset, and a fixed five-item key would show
 *  buckets that never appear. Hidden below two roles. */
function RoleLegend({ roles, count }: Readonly<{ roles: ParticipantRole[]; count: number }>) {
  const { t } = useTranslation('analysis');
  const present = [...new Set(roles.map((p) => p.role.toLowerCase()))];
  return (
    <div className="ea-role-legend">
      <span className="ea-label">{t('event.sections.participantRoles')}</span>
      <span className="ea-label">{t('event.labels.participantsCount', { count })}</span>
      {present.length >= 2 && (
        <>
          <span className="ea-label">{t('event.labels.roleLegend')}</span>
          <div className="ea-role-legend-items">
            {present.map((role) => (
              <span key={role} className="ea-role-legend-item" data-role={roleClass(role)}>
                <span className="ea-role-legend-dot" />
                {roleLabel(role, t)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ParticipantsSection({ data }: { data: EventAnalysisDetailType }) {
  const roles = data.eep.participantRoles ?? [];
  if (roles.length === 0) return null;
  return (
    <div className="ea-participants-block">
      <RoleLegend roles={roles} count={roles.length} />
      <div className="ea-participants">
        {roles.map((p) => (
          <ParticipantCard key={p.entityId} p={p} />
        ))}
      </div>
    </div>
  );
}

function SectionHead({ title, sub }: Readonly<{ title: string; sub: string }>) {
  return (
    <div className="ea-section-head">
      <div className="ea-section-titlewrap">
        <h3 className="ea-section-title">{title}</h3>
        <span className="ea-section-sub">{sub}</span>
      </div>
    </div>
  );
}

function CausalitySection({
  data,
  variant = 'stepped',
  failed = false,
}: {
  data: { causality: CausalityAnalysis };
  variant?: 'timeline' | 'stepped' | 'flat';
  failed?: boolean;
}) {
  const { t } = useTranslation('analysis');
  const c = data.causality;
  const isEmpty = causalityEmpty(data);
  if (isEmpty && !failed) return null;
  if (isEmpty && failed) {
    return (
      <div className="ea-section">
        <SectionHead title={t('event.sections.causality')} sub={t('event.labels.causalitySub')} />
        <p className="ea-section-failed">{t('event.causalityFailed')}</p>
      </div>
    );
  }
  return (
    <div className="ea-section">
      <SectionHead title={t('event.sections.causality')} sub={t('event.labels.causalitySub')} />
      <div className={'ea-causal ' + variant}>
        {c.rootCause && (
          <div className="ea-section-block">
            <span className="ea-label">{t('event.labels.rootCauseLabel')}</span>
            <p className="ea-section-text">{c.rootCause}</p>
          </div>
        )}
        {c.causalChain.length > 0 && (
          <div className="ea-causal-chain">
            {c.causalChain.map((step, i) => (
              <div key={i} className="ea-causal-step">
                <span className="ea-causal-step-n">{String(i + 1).padStart(2, '0')}</span>
                <p className="ea-causal-step-text">{step}</p>
              </div>
            ))}
          </div>
        )}
        {c.chainSummary && <p className="ea-causal-summary">{c.chainSummary}</p>}
      </div>
    </div>
  );
}

function ImpactSection({ data, failed = false }: { data: { impact: ImpactAnalysis }; failed?: boolean }) {
  const { t } = useTranslation('analysis');
  const i = data.impact;
  const isEmpty = impactEmpty(data);
  if (isEmpty && !failed) return null;
  if (isEmpty && failed) {
    return (
      <div className="ea-section">
        <SectionHead title={t('event.sections.impact')} sub={t('event.labels.impactSub')} />
        <p className="ea-section-failed">{t('event.impactFailed')}</p>
      </div>
    );
  }
  return (
    <div className="ea-section">
      <SectionHead title={t('event.sections.impact')} sub={t('event.labels.impactSub')} />
      {i.impactSummary && <p className="ea-section-text">{i.impactSummary}</p>}
      <div className="ea-impact-grid">
        <div className="ea-impact-col">
          <span className="ea-label">{t('event.labels.participantImpacts')}</span>
          <ul className="ea-impact-list">
            {i.participantImpacts.map((p, idx) => (
              <li key={idx} className="ea-impact-item">
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="ea-impact-col">
          <span className="ea-label">{t('event.labels.relationChanges')}</span>
          <ul className="ea-impact-list">
            {i.relationChanges.map((r, idx) => (
              <li key={idx} className="ea-impact-item">
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FactorsSection({ data }: { data: EventAnalysisDetailType }) {
  const { t } = useTranslation('analysis');
  const factors = data.eep.causalFactors ?? [];
  const consequences = data.eep.consequences ?? [];
  if (factorsEmpty(data)) return null;
  return (
    <div className="ea-section">
      <SectionHead
        title={t('event.labels.factorsConsequences')}
        sub={t('event.labels.factorsConsequencesSub')}
      />
      <div className="ea-fc-grid">
        {factors.length > 0 && (
          <div className="ea-fc-col">
            <span className="ea-label">{t('event.labels.factorsLabel')}</span>
            <ul className="ea-bullets">
              {factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {consequences.length > 0 && (
          <div className="ea-fc-col">
            <span className="ea-label">{t('event.labels.consequencesLabel')}</span>
            <ul className="ea-bullets consequences">
              {consequences.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function QuotesSection({ data, bookId }: { data: EventAnalysisDetailType; bookId?: string }) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  const quotes = data.eep.keyQuotes ?? [];
  // #7m pins each quote to its paragraph by exact text; a quote it could not
  // pin to exactly one paragraph stays plain text rather than jump somewhere wrong.
  const { data: sources } = useQuery({
    queryKey: qk.event.quoteSources(bookId, data.eventId),
    queryFn: () => fetchEventQuoteSources(bookId!, data.eventId),
    enabled: !!bookId && quotes.length > 0,
  });
  if (quotes.length === 0) return null;
  return (
    <div className="ea-section">
      <SectionHead
        title={t('event.sections.keyQuotes')}
        sub={t('event.labels.keyQuotesCount', { count: quotes.length })}
      />
      <div className="ea-quotes">
        {quotes.map((q, i) => {
          const src = sources?.quotes?.[i];
          const pinned = src?.text === q && src.paragraphId ? src : null;
          return (
            <p key={i} className="ea-quote">
              {pinned ? (
                <SourceJumpText
                  text={q}
                  pending={false}
                  onJump={() =>
                    navigate(`/books/${bookId}`, {
                      state: { paragraphId: pinned.paragraphId, chapterNumber: pinned.chapterNumber },
                    })
                  }
                />
              ) : (
                q
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/** Term frequency bars for `eep.topTerms`, the densest signal in the payload
 *  that nothing rendered before. Sorted descending and capped — the backend
 *  returns ~20 terms and the long tail is noise. */
function TermsSection({ data }: Readonly<{ data: EventAnalysisDetailType }>) {
  const { t } = useTranslation('analysis');
  const terms = Object.entries(data.eep.topTerms ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, TERM_LIMIT);
  if (terms.length === 0) return null;
  const max = terms[0][1] || 1;
  return (
    <div className="ea-section">
      <SectionHead title={t('event.sections.topTerms')} sub={t('event.labels.topTermsSub')} />
      <div className="ea-terms">
        {terms.map(([term, weight]) => (
          <div key={term} className="ea-term-row">
            <span className="ea-term-label">{term}</span>
            <div className="ea-term-track">
              <div className="ea-term-fill" style={{ width: `${(weight / max) * 100}%` }} />
            </div>
            <span className="ea-term-pct">{Math.round(weight * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TERM_LIMIT = 12;

function TabEmpty() {
  const { t } = useTranslation('analysis');
  return <p className="ea-context-empty">{t('event.detail.tabEmpty')}</p>;
}

type DetailTab = 'overview' | 'cause' | 'context' | 'evidence';

/** The event a 上下文位置 hop is heading to; see the tab-reset effect below. */
let contextHopTarget: string | null = null;

const DETAIL_TABS: { key: DetailTab; labelKey: string }[] = [
  { key: 'overview', labelKey: 'event.tabs.overview' },
  { key: 'cause', labelKey: 'event.tabs.cause' },
  { key: 'context', labelKey: 'event.tabs.context' },
  { key: 'evidence', labelKey: 'event.tabs.evidence' },
];

export function EventAnalysisDetail({
  data,
  causalVariant = 'stepped',
  showHero = true,
  bookId,
  onSelectEvent,
  header,
}: Props) {
  const { t } = useTranslation('analysis');
  const failedParts = data.failedParts ?? [];
  // Switching events should land on the overview, not wherever the previous
  // event was left — except when the hop came from the 上下文位置 tab itself,
  // where staying put lets the reader walk the chain neighbour by neighbour.
  // Module-level, keyed by the target event: the page unmounts this component
  // while the next event's detail loads, so a ref or state would not survive.
  const [tab, setTab] = useState<DetailTab>(() =>
    contextHopTarget === data.eventId ? 'context' : 'overview',
  );
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (contextHopTarget === data.eventId) {
      setTab('context');
    } else {
      contextHopTarget = null;
      setTab('overview');
    }
  }, [data.eventId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const selectFromContext = onSelectEvent
    ? (id: string) => {
        contextHopTarget = id;
        onSelectEvent(id);
      }
    : undefined;

  const tabs = DETAIL_TABS.filter((dt) => dt.key !== 'context' || bookId);
  // WAI-ARIA tabs (automatic activation, same as the graph LensCard): only the
  // selected tab is in the Tab order; ←/→ wrap, Home/End jump.
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((dt) => dt.key === tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].key);
    document.getElementById(`ea-detail-tab-${tabs[next].key}`)?.focus();
  };

  return (
    <>
      <div className="ea-detail-head">
        {header}
        <div className="ss-utabs" role="tablist" onKeyDown={onTabKeyDown}>
          {tabs.map((dt) => (
            <button
              key={dt.key}
              id={`ea-detail-tab-${dt.key}`}
              type="button"
              role="tab"
              aria-selected={tab === dt.key}
              aria-controls="ea-detail-panel"
              tabIndex={tab === dt.key ? 0 : -1}
              className={'ss-utab' + (tab === dt.key ? ' active' : '')}
              onClick={() => setTab(dt.key)}
            >
              {t(dt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div
        className="ea-detail-body"
        id="ea-detail-panel"
        role="tabpanel"
        aria-labelledby={`ea-detail-tab-${tab}`}
      >
        {tab === 'overview' && (
          <>
            {showHero && <EventHero data={data} />}
            <StateSection data={data} />
            <ParticipantsSection data={data} />
          </>
        )}

        {tab === 'cause' && (
          <>
            {causeTabEmpty(data, failedParts) && <TabEmpty />}
            <CausalitySection
              data={data}
              variant={causalVariant}
              failed={failedParts.includes('causality')}
            />
            <ImpactSection data={data} failed={failedParts.includes('impact')} />
            <FactorsSection data={data} />
          </>
        )}

        {tab === 'context' && bookId && (
          <EventContextTab bookId={bookId} eventId={data.eventId} onSelectEvent={selectFromContext} />
        )}

        {tab === 'evidence' && (
          <>
            {evidenceTabEmpty(data) && <TabEmpty />}
            <QuotesSection data={data} bookId={bookId} />
            <TermsSection data={data} />
          </>
        )}
      </div>
    </>
  );
}
