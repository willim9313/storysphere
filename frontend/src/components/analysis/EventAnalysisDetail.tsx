import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
}

function EventHero({ data }: { data: EventAnalysisDetailType }) {
  const { t } = useTranslation('analysis');
  const imp = data.eep.eventImportance;
  const isKernel = imp === 'KERNEL';
  if (!data.eep.thematicSignificance && !data.summary?.summary) return null;
  return (
    <div className="ea-hero" data-importance={isKernel ? 'kernel' : 'satellite'}>
      {data.eep.thematicSignificance && (
        <>
          <span className="ea-hero-thematic-label">
            {t('event.labels.thematicSignificance')}
          </span>
          <p className="ea-hero-thematic">{data.eep.thematicSignificance}</p>
        </>
      )}
      {data.summary?.summary && (
        <>
          <span className="ea-hero-summary-label">{t('event.labels.summaryLabel')}</span>
          <p className="ea-hero-summary">{data.summary.summary}</p>
        </>
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
    <div className="ea-section">
      <div className="ea-section-head">
        <div className="ea-section-titlewrap">
          <h3 className="ea-section-title">{t('event.sections.stateChange')}</h3>
          <span className="ea-section-sub">{t('event.labels.stateChangeSub')}</span>
        </div>
      </div>
      {(eep.stateBefore || eep.stateAfter) && (
        <div className="ea-state-grid">
          <div className="ea-state before">
            <span className="ea-state-label">{t('event.labels.before')}</span>
            <p className="ea-state-text">{eep.stateBefore}</p>
          </div>
          <div className="ea-state-arrow" aria-hidden="true">
            <ArrowRight size={20} color="var(--accent)" />
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
            <div className="ea-state-meta-item">
              <span className="label">{t('event.sections.structuralRole')}</span>
              <p className="value">{eep.structuralRole}</p>
            </div>
          )}
          {eep.eventImportance && (
            <div className="ea-state-meta-item">
              <span className="label">{t('event.sections.importance')}</span>
              <p className="value">
                {eep.eventImportance === 'KERNEL'
                  ? t('event.importance.kernelTagline')
                  : t('event.importance.satelliteTagline')}
              </p>
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
    <div className="ea-participant">
      <div className="ea-participant-avatar">{initial}</div>
      <div className="ea-participant-body">
        <div className="ea-participant-head">
          <span className="ea-participant-name">{p.entityName}</span>
          <span className={'ea-participant-role ' + cls}>{roleLabel(p.role, t)}</span>
        </div>
        <p className="ea-participant-impact">{p.impactDescription}</p>
      </div>
    </div>
  );
}

/** Colour key for the role tags, listing only the roles this event actually
 *  uses — the backend emits a subset, and a fixed five-item key would show
 *  buckets that never appear. */
function RoleLegend({ roles }: Readonly<{ roles: ParticipantRole[] }>) {
  const { t } = useTranslation('analysis');
  const present = [...new Set(roles.map((p) => p.role.toLowerCase()))];
  if (present.length < 2) return null;
  return (
    <div className="ea-role-legend">
      <span className="ea-role-legend-head">{t('event.labels.roleLegend')}</span>
      {present.map((role) => (
        <span key={role} className="ea-role-legend-item">
          <span className={'ea-role-legend-dot ' + roleClass(role)} />
          {roleLabel(role, t)}
        </span>
      ))}
    </div>
  );
}

function ParticipantsSection({ data }: { data: EventAnalysisDetailType }) {
  const { t } = useTranslation('analysis');
  const roles = data.eep.participantRoles ?? [];
  if (roles.length === 0) return null;
  return (
    <div className="ea-section">
      <div className="ea-section-head">
        <div className="ea-section-titlewrap">
          <h3 className="ea-section-title">{t('event.sections.participantRoles')}</h3>
          <span className="ea-section-sub">
            {t('event.labels.participantsCount', { count: roles.length })}
          </span>
        </div>
      </div>
      <RoleLegend roles={roles} />
      <div className="ea-participants">
        {roles.map((p) => (
          <ParticipantCard key={p.entityId} p={p} />
        ))}
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
  const isEmpty = !c.rootCause && c.causalChain.length === 0 && !c.chainSummary;
  if (isEmpty && !failed) return null;
  if (isEmpty && failed) {
    return (
      <div className="ea-section">
        <div className="ea-section-head">
          <div className="ea-section-titlewrap">
            <h3 className="ea-section-title">{t('event.sections.causality')}</h3>
            <span className="ea-section-sub">{t('event.labels.causalitySub')}</span>
          </div>
        </div>
        <p className="ea-section-failed" style={{ color: 'var(--color-warning)' }}>
          {t('event.causalityFailed')}
        </p>
      </div>
    );
  }
  return (
    <div className="ea-section">
      <div className="ea-section-head">
        <div className="ea-section-titlewrap">
          <h3 className="ea-section-title">{t('event.sections.causality')}</h3>
          <span className="ea-section-sub">{t('event.labels.causalitySub')}</span>
        </div>
      </div>
      <div className={'ea-causal ' + variant}>
        {c.rootCause && (
          <div className="ea-causal-root">
            <span className="ea-causal-root-label">{t('event.labels.rootCauseLabel')}</span>
            <p className="ea-causal-root-text">{c.rootCause}</p>
          </div>
        )}
        {c.causalChain.length > 0 && (
          <div className="ea-causal-chain">
            {c.causalChain.map((step, i) => (
              <div key={i} className="ea-causal-step">
                <span className="ea-causal-step-marker">{i + 1}</span>
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
  const isEmpty =
    !i.impactSummary && i.participantImpacts.length === 0 && i.relationChanges.length === 0;
  if (isEmpty && !failed) return null;
  if (isEmpty && failed) {
    return (
      <div className="ea-section">
        <div className="ea-section-head">
          <div className="ea-section-titlewrap">
            <h3 className="ea-section-title">{t('event.sections.impact')}</h3>
            <span className="ea-section-sub">{t('event.labels.impactSub')}</span>
          </div>
        </div>
        <p className="ea-section-failed" style={{ color: 'var(--color-warning)' }}>
          {t('event.impactFailed')}
        </p>
      </div>
    );
  }
  return (
    <div className="ea-section">
      <div className="ea-section-head">
        <div className="ea-section-titlewrap">
          <h3 className="ea-section-title">{t('event.sections.impact')}</h3>
          <span className="ea-section-sub">{t('event.labels.impactSub')}</span>
        </div>
      </div>
      {i.impactSummary && <p className="ea-impact-summary">{i.impactSummary}</p>}
      <div className="ea-impact-grid">
        <div className="ea-impact-col">
          <div className="ea-impact-col-label">{t('event.labels.participantImpacts')}</div>
          <ul className="ea-impact-list">
            {i.participantImpacts.map((p, idx) => (
              <li key={idx} className="ea-impact-item">
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="ea-impact-col">
          <div className="ea-impact-col-label">{t('event.labels.relationChanges')}</div>
          <ul className="ea-impact-list">
            {i.relationChanges.map((r, idx) => (
              <li key={idx} className="ea-impact-item">
                <span>{r}</span>
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
  if (factors.length === 0 && consequences.length === 0) return null;
  return (
    <div className="ea-section">
      <div className="ea-section-head">
        <div className="ea-section-titlewrap">
          <h3 className="ea-section-title">{t('event.labels.factorsConsequences')}</h3>
          <span className="ea-section-sub">{t('event.labels.factorsConsequencesSub')}</span>
        </div>
      </div>
      <div className="ea-fc-grid">
        {factors.length > 0 && (
          <div>
            <div className="ea-fc-col-label">{t('event.labels.factorsLabel')}</div>
            <ul className="ea-bullets">
              {factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {consequences.length > 0 && (
          <div>
            <div className="ea-fc-col-label">{t('event.labels.consequencesLabel')}</div>
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

function QuotesSection({ data }: { data: EventAnalysisDetailType }) {
  const { t } = useTranslation('analysis');
  const quotes = data.eep.keyQuotes ?? [];
  if (quotes.length === 0) return null;
  return (
    <div className="ea-section">
      <div className="ea-section-head">
        <div className="ea-section-titlewrap">
          <h3 className="ea-section-title">{t('event.sections.keyQuotes')}</h3>
          <span className="ea-section-sub">
            {t('event.labels.keyQuotesCount', { count: quotes.length })}
          </span>
        </div>
      </div>
      <div className="ea-quotes">
        {quotes.map((q, i) => (
          <div key={i} className="ea-quote">
            {q}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventAnalysisDetail({
  data,
  causalVariant = 'stepped',
  showHero = true,
}: Props) {
  const failedParts = data.failedParts ?? [];
  return (
    <>
      {showHero && <EventHero data={data} />}
      <StateSection data={data} />
      <ParticipantsSection data={data} />
      <CausalitySection
        data={data}
        variant={causalVariant}
        failed={failedParts.includes('causality')}
      />
      <ImpactSection data={data} failed={failedParts.includes('impact')} />
      <FactorsSection data={data} />
      <QuotesSection data={data} />
    </>
  );
}
