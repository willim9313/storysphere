import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Palette, Languages, Compass, Cpu, Server, Info, Keyboard,
  FlaskConical, Check, ArrowRight, ArrowLeft, AlertTriangle,
  HardDrive, Loader2, CircleCheck, CircleX, RefreshCw,
} from 'lucide-react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';
import {
  fetchKgStatus, switchKgMode, startMigration, fetchMigrationStatus,
  type KgStatus, type MigrationDirection,
} from '@/api/kgSettings';
import { fetchSettingsInfo, type SettingsInfo } from '@/api/settingsInfo';
import type { TaskStatus } from '@/api/types';
import {
  deployBadges, gapLayer, isUnsetValue, kgMigrationGate, kgSwitchAction, splitFeatureIds,
  type DeployMode, type KgBackend,
} from '@/components/settings/settingsModel';
import { resetAllGuidance, useDismissedCount } from '@/components/ui/guidanceStore';
import '@/styles/settings.css';

// ── Nav model ───────────────────────────────────────────────

type PanelId = 'appearance' | 'language' | 'guidance' | 'llm' | 'env' | 'shortcuts' | 'experimental' | 'about';
type BadgeKind = 'dev' | 'merged' | 'planned';

const NAV_GROUPS: { labelKey: string; items: { id: PanelId; labelKey: string; badge?: BadgeKind }[] }[] = [
  {
    labelKey: 'nav.groupPrefs',
    items: [
      { id: 'appearance', labelKey: 'nav.appearance' },
      { id: 'language', labelKey: 'nav.language', badge: 'merged' },
      { id: 'guidance', labelKey: 'nav.guidance' },
    ],
  },
  {
    labelKey: 'nav.groupSystem',
    items: [
      { id: 'llm', labelKey: 'nav.llm' },
      { id: 'env', labelKey: 'nav.env', badge: 'dev' },
    ],
  },
  {
    labelKey: 'nav.groupOther',
    items: [
      { id: 'shortcuts', labelKey: 'nav.shortcuts', badge: 'planned' },
      { id: 'experimental', labelKey: 'nav.experimental', badge: 'planned' },
      { id: 'about', labelKey: 'nav.about' },
    ],
  },
];

const PANEL_IDS: PanelId[] = NAV_GROUPS.flatMap((g) => g.items.map((it) => it.id));

const BADGE_KEY: Record<BadgeKind, string> = {
  dev: 'nav.badgeDev',
  merged: 'nav.badgeMerged',
  planned: 'nav.badgePlanned',
};

const NAV_ICONS: Record<PanelId, React.ReactNode> = {
  appearance: <Palette size={15} />,
  language: <Languages size={15} />,
  guidance: <Compass size={15} />,
  llm: <Cpu size={15} />,
  env: <Server size={15} />,
  shortcuts: <Keyboard size={15} />,
  experimental: <FlaskConical size={15} />,
  about: <Info size={15} />,
};

// ── Shared helpers ───────────────────────────────────────────

function PanelHead({ title, sub, badge }: { title: string; sub?: string; badge?: BadgeKind }) {
  const { t } = useTranslation('settings');
  return (
    <div className="st-panel-head">
      <div className="st-panel-title-row">
        <h2 className="st-panel-title">{title}</h2>
        {badge && <span className={`st-badge ${badge}`}>{t(BADGE_KEY[badge])}</span>}
      </div>
      {sub && <p className="st-panel-sub">{sub}</p>}
    </div>
  );
}

function StSection({ icon, title, hideHead, children }: {
  icon: React.ReactNode; title: string; hideHead?: boolean; children: React.ReactNode;
}) {
  return (
    <section className="st-section">
      {!hideHead && (
        <div className="st-section-head">
          <span className="st-section-ico">{icon}</span>
          <h3 className="st-section-title">{title}</h3>
        </div>
      )}
      {children}
    </section>
  );
}

/** Inline loading — the panel switch and left nav stay usable throughout. */
function PanelLoading() {
  const { t } = useTranslation('settings');
  return (
    <div className="st-loading" role="status">
      <Loader2 size={16} className="animate-spin" />
      <span>{t('common.loading')}</span>
    </div>
  );
}

/** Red one-liner + a manual 重試 — never auto-retries, no countdown. */
function PanelFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('common');
  // 重試 puts the query back to pending, so this unmounts for the loading state; when the retry fails too,
  // give focus back to it instead of leaving keyboard users on <body>.
  const retryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body) retryRef.current?.focus();
  }, []);
  return (
    <div className="st-failure" role="alert">
      <div className="st-failure-line">
        <AlertTriangle size={16} />
        <span>{message}</span>
      </div>
      <button ref={retryRef} type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={onRetry}>
        {t('retry')}
      </button>
    </div>
  );
}

// ── Migration progress (three states) ────────────────────────

function MigrationState({ kind, children }: {
  kind: 'running' | 'done' | 'failed'; children: React.ReactNode;
}) {
  const icon = kind === 'done'
    ? <CircleCheck size={16} />
    : kind === 'failed'
      ? <CircleX size={16} />
      : <Loader2 size={16} className="animate-spin" />;
  return (
    <div className={`st-mig-state ${kind}`} role={kind === 'failed' ? 'alert' : 'status'}>
      <span className="st-mig-state-ico">{icon}</span>
      <span className="st-mig-state-text">{children}</span>
    </div>
  );
}

/** Polls a migration task every 2s until it ends — or until polling itself fails
 *  (e.g. 404 after a backend restart), which also ends it instead of spinning forever. */
function useMigrationTask(taskId: string | null) {
  return useQuery<TaskStatus>({
    queryKey: ['kg-migration', taskId],
    queryFn: () => fetchMigrationStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: (q) => {
      if (q.state.status === 'error') return false;
      const s = q.state.data?.status;
      return s === 'done' || s === 'error' ? false : 2000;
    },
  });
}

function MigrationProgress({ task, pollError, onDone }: {
  task: TaskStatus | undefined; pollError: Error | null; onDone: () => void;
}) {
  const { t } = useTranslation('settings');

  // The done row collapses itself after 3s and refreshes KG status. No countdown is drawn.
  useEffect(() => {
    if (task?.status !== 'done') return;
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [task?.status, onDone]);

  if (task?.status === 'done') {
    const r = task.result as Record<string, number> | null;
    return (
      <MigrationState kind="done">
        {t('env.migTitle')} — {r?.entities ?? 0} {t('env.entities')}、{r?.relations ?? 0} {t('env.relations')}、{r?.events ?? 0} {t('env.events')}
      </MigrationState>
    );
  }
  if (task?.status === 'error') {
    // Backend's own words — not rewritten, not translated.
    return <MigrationState kind="failed">{task.error}</MigrationState>;
  }
  if (pollError) {
    // Polling gave up (e.g. task not found): same failed state, same raw wording.
    return <MigrationState kind="failed">{pollError.message}</MigrationState>;
  }
  return <MigrationState kind="running">{t('env.migrating')}</MigrationState>;
}

// ── Appearance panel ─────────────────────────────────────────

const THEME_OPTS: { id: Theme; nameKey: string; descKey: string }[] = [
  { id: 'warm', nameKey: 'appearance.warm', descKey: 'appearance.warmDesc' },
  { id: 'ink',  nameKey: 'appearance.ink',  descKey: 'appearance.inkDesc' },
];

function AppearancePanel() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();

  return (
    <div className="st-panel">
      <PanelHead title={t('appearance.title')} sub={t('appearance.sub')} />
      <StSection icon={<Palette size={16} />} title={t('appearance.sectionTitle')}>
        <div className="st-theme-grid">
          {THEME_OPTS.map((o) => {
            const on = theme === o.id;
            return (
              <button
                key={o.id}
                type="button"
                className={'st-theme-card' + (on ? ' active' : '')}
                aria-pressed={on}
                onClick={() => setTheme(o.id)}
              >
                {/* Ink reads its real tokens through a scoped data-theme; Warm keeps the
                    documented hex exception (see settings.css). */}
                <div
                  className={'st-theme-swatch' + (o.id === 'warm' ? ' warm' : '')}
                  data-theme={o.id === 'ink' ? 'ink' : undefined}
                >
                  <span /><span /><span /><span />
                </div>
                {on && (
                  <span className="st-theme-current">
                    <Check size={11} strokeWidth={2} />
                    {t('appearance.current')}
                  </span>
                )}
                <div className="st-theme-meta">
                  <span className="st-theme-name">{t(o.nameKey)}</span>
                  <span className="st-theme-desc">{t(o.descKey)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </StSection>
    </div>
  );
}

// ── Guidance panel ───────────────────────────────────────────

/** Reset is zero-cost and reversible (dismiss again), so: no glyph, no confirm,
 *  no toast — the count flipping to "none" and the button disabling is the feedback. */
function GuidancePanel() {
  const { t } = useTranslation('settings');
  const n = useDismissedCount();
  // The button disables itself on reset; park focus on the count so keyboard users keep their place.
  const countRef = useRef<HTMLSpanElement>(null);

  return (
    <div className="st-panel">
      <PanelHead title={t('guidance.title')} sub={t('guidance.hint')} />
      <div className="st-guidance-row">
        <button
          type="button"
          className="ss-btn ss-btn-md ss-btn-secondary"
          disabled={n === 0}
          onClick={() => {
            resetAllGuidance();
            countRef.current?.focus();
          }}
        >
          {t('guidance.reset')}
        </button>
        <span className="st-guidance-count" aria-live="polite" ref={countRef} tabIndex={-1}>
          {n === 0 ? t('guidance.countNone') : t('guidance.count', { n })}
        </span>
      </div>
    </div>
  );
}

// ── Language panel ───────────────────────────────────────────

function LanguagePanel() {
  const { t, i18n } = useTranslation('settings');
  const lang = i18n.language;

  return (
    <div className="st-panel">
      <PanelHead title={t('language.title')} badge="merged" />
      <div className="st-field">
        <span className="st-field-label" id="st-ui-lang">{t('language.uiLanguage')}</span>
        <div className="ss-seg st-seg" role="group" aria-labelledby="st-ui-lang">
          <button
            type="button"
            className={'ss-seg-item' + (lang === 'zh-TW' ? ' active' : '')}
            aria-pressed={lang === 'zh-TW'}
            onClick={() => i18n.changeLanguage('zh-TW')}
          >
            {t('language.zhTW')}
          </button>
          <button
            type="button"
            className={'ss-seg-item' + (lang === 'en' ? ' active' : '')}
            aria-pressed={lang === 'en'}
            onClick={() => i18n.changeLanguage('en')}
          >
            {t('language.en')}
          </button>
        </div>
        <p className="st-field-hint">{t('language.uiLanguageHint')}</p>
      </div>
      <div className="st-field is-soon">
        <div className="st-field-label-row">
          <span className="st-field-label" id="st-out-lang">{t('language.outputLanguage')}</span>
          <span className="st-badge planned">{t('language.soon')}</span>
        </div>
        <div className="ss-seg st-seg" role="group" aria-labelledby="st-out-lang">
          <button type="button" className="ss-seg-item active" disabled>{t('language.followUi')}</button>
          <button type="button" className="ss-seg-item" disabled>{t('language.custom')}</button>
        </div>
        <p className="st-field-hint">{t('language.outputLanguageHint')}</p>
      </div>
    </div>
  );
}

// ── LLM panel ────────────────────────────────────────────────

function LlmPanel() {
  const { t } = useTranslation('settings');
  const { data, isLoading, error, refetch } = useQuery<SettingsInfo>({
    queryKey: ['settings-info'],
    queryFn: fetchSettingsInfo,
  });

  const rows: [string, string][] = data ? [
    [t('llm.provider'), data.primaryLlmProvider],
    [t('llm.primaryModel'), data.primaryModel],
    [t('llm.analysisTemp'), String(data.analysisTemperature)],
    [t('llm.chatTemp'), String(data.chatAgentTemperature)],
    [t('llm.localModel'), data.localLlmModel],
  ] : [];

  return (
    <div className="st-panel">
      <PanelHead title={t('llm.title')} sub={t('llm.sub')} />
      {isLoading ? (
        <PanelLoading />
      ) : error || !data ? (
        <PanelFailure message={t('llm.loadError')} onRetry={() => refetch()} />
      ) : (
        <>
          <StSection icon={<Cpu size={16} />} title={t('llm.sectionTitle')}>
            <div className="st-rows st-rows-llm">
              {rows.map(([k, v]) => (
                <div className="st-row" key={k}>
                  <span className="st-row-key">{k}</span>
                  <code className={'st-row-val mono' + (isUnsetValue(v) ? ' muted' : '')}>{v}</code>
                </div>
              ))}
            </div>
          </StSection>
          <p className="st-note">{t('llm.note')}</p>
        </>
      )}
    </div>
  );
}

// ── Environment panel ────────────────────────────────────────

function StandardField({ id, name, optional, placeholder, secret, flag }: {
  id: string; name: string; optional?: string; placeholder: string; secret?: boolean;
  flag: 'restart' | 'live';
}) {
  const { t } = useTranslation('settings');
  return (
    <div className="st-fieldrow">
      <div className="st-fieldrow-main">
        <label className="st-fieldrow-label" htmlFor={id}>
          {name}
          {optional && <span className="st-fieldrow-opt">{optional}</span>}
        </label>
        {/* Preview-only: placeholder, no value / onChange — nothing typed here is saved or sent. */}
        <input
          id={id} className="st-input" type={secret ? 'password' : 'text'} placeholder={placeholder}
          readOnly aria-describedby={`${id}-flag`}
        />
      </div>
      <span className={`st-flag ${flag}`} id={`${id}-flag`}>{t(flag === 'restart' ? 'env.restartFlag' : 'env.kgLiveFlag')}</span>
    </div>
  );
}

function GapNotice({ layer }: { layer: ReturnType<typeof gapLayer> }) {
  const { t } = useTranslation('settings');
  if (layer.kind === 'none') return null;
  const { known, unknownCount } = splitFeatureIds(layer.ids);
  // Wording one (already happening): error · circle-x · solid chips.
  // Wording two (avoidable, not yet): warning · alert-triangle · outlined chips.
  const now = layer.kind === 'now';
  return (
    <div className={'st-gap ' + (now ? 'now' : 'warn')}>
      <span className="st-gap-ico">{now ? <CircleX size={16} /> : <AlertTriangle size={16} />}</span>
      <div className="st-gap-body">
        <span className="st-gap-text">
          {now
            ? t('env.kgGapsNow')
            : t('env.kgGapsIfSwitch', { mode: layer.otherMode === 'neo4j' ? 'Neo4j' : 'NetworkX' })}
        </span>
        <div className="st-gap-chips">
          {known.map((id) => (
            <span key={id} className="st-gap-chip">{t(`env.kgFeature.${id}`)}</span>
          ))}
          {/* Unknown ids never surface raw — they fold into one generic chip. */}
          {unknownCount > 0 && <span className="st-gap-chip">{t('env.kgFeatureUnknown')}</span>}
        </div>
      </div>
    </div>
  );
}

/** The migration task id lives on SettingsPage so leaving the panel mid-migration
 *  doesn't forget it (and re-enable 執行遷移 for a second run). */
function EnvPanel({ migrationTaskId, setMigrationTaskId }: {
  migrationTaskId: string | null; setMigrationTaskId: (id: string | null) => void;
}) {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();

  const { data: kg, isLoading: kgLoading, error: kgError, refetch } = useQuery<KgStatus>({
    queryKey: ['kg-status'],
    queryFn: fetchKgStatus,
    refetchInterval: 15_000, // background refresh — deliberately no visual cue
  });

  const [uiModeOverride, setUiMode] = useState<DeployMode | null>(null);
  const [kgBackendOverride, setKgBackendState] = useState<KgBackend | null>(null);
  const actualDeployMode = (kg?.deployMode as DeployMode | undefined) ?? 'lightweight';
  const uiMode: DeployMode = uiModeOverride ?? actualDeployMode;
  const liveKgBackend: KgBackend = (kg?.mode as KgBackend | undefined) ?? 'networkx';
  const kgBackend: KgBackend = kgBackendOverride ?? liveKgBackend;
  const { data: migrationTask, error: migrationPollError } = useMigrationTask(migrationTaskId);
  // Manual 重新整理狀態 gets its own feedback; the 15s background refresh stays silent.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const deployCardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const switchMutation = useMutation({
    mutationFn: (mode: KgBackend) => switchKgMode(mode),
    onSuccess: () => {
      setSwitchError(null);
      queryClient.invalidateQueries({ queryKey: ['kg-status'] });
    },
    onError: (err: Error) => {
      setSwitchError(err.message);
      setKgBackendState(null);
    },
  });

  const migrateMutation = useMutation({
    mutationFn: (direction: MigrationDirection) => startMigration(direction),
    onMutate: () => setMigrationTaskId(null),
    onSuccess: (task) => setMigrationTaskId(task.taskId),
    onError: () => setMigrationTaskId(null),
  });

  // Only an actual Standard deployment switches for real; a Lightweight preview just redraws.
  const kgSwitchIsLive = actualDeployMode === 'standard';

  const handleKgBackendChange = (mode: KgBackend) => {
    const action = kgSwitchAction({ actual: actualDeployMode, current: liveKgBackend, next: mode });
    if (action === 'noop') return;
    setKgBackendState(mode);
    setSwitchError(null);
    if (action === 'switch') switchMutation.mutate(mode);
  };

  const isStd = uiMode === 'standard';
  const isPreviewing = uiMode !== actualDeployMode;
  // Reported for every selectable backend (not just the live one) so the warning sits
  // under the segmented control *before* the switch, not as a 500 on the graph page after.
  // Keyed on the live backend: a previewed Neo4j must read 「切換到 Neo4j 會停用…」, not 「目前後端無法提供…」.
  const layer = gapLayer(kg?.unsupportedByMode ?? {}, liveKgBackend);
  const gate = kgMigrationGate({
    isStandard: actualDeployMode === 'standard',
    backend: kgBackend,
    // Busy only while the task is live: a failed one must not lock the button forever.
    busy: migrateMutation.isPending || (!!migrationTaskId && !migrationPollError
      && migrationTask?.status !== 'done' && migrationTask?.status !== 'error'),
  });

  const deployCards: { mode: DeployMode; name: string; desc: string; qdrant: string; kg: string }[] = [
    { mode: 'lightweight', name: t('env.lightweight'), desc: t('env.lwDesc'), qdrant: t('env.qdrantLw'), kg: t('env.kgLw') },
    { mode: 'standard', name: t('env.standard'), desc: t('env.stDesc'), qdrant: t('env.qdrantSt'), kg: t('env.kgSt') },
  ];

  const handleRefresh = async () => {
    setRefreshing(true);
    const r = await refetch();
    setRefreshFailed(r.isError);
    setRefreshing(false);
  };

  if (kgLoading) {
    return (
      <div className="st-panel">
        <PanelHead title={t('env.title')} sub={t('env.sub')} badge="dev" />
        <PanelLoading />
      </div>
    );
  }
  if (kgError && !kg) {
    return (
      <div className="st-panel">
        <PanelHead title={t('env.title')} sub={t('env.sub')} badge="dev" />
        <PanelFailure message={t('env.loadError')} onRetry={() => refetch()} />
      </div>
    );
  }

  const migRows: { key: string; dir: MigrationDirection; arrow: React.ReactNode; label: string; sub: string }[] = [
    { key: 'nx', dir: 'nx_to_neo4j', arrow: <ArrowRight size={15} />, label: t('env.migNxNeo'), sub: t('env.migNxNeoSub') },
    { key: 'neo', dir: 'neo4j_to_nx', arrow: <ArrowLeft size={15} />, label: t('env.migNeoNx'), sub: t('env.migNeoNxSub') },
  ];

  // Radio-group keyboard (APG): one tab stop on the checked card; arrows move focus and check.
  const onDeployKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + deployCards.length) % deployCards.length;
    setUiMode(deployCards[next].mode);
    deployCardRefs.current[next]?.focus();
  };

  const deployGrid = (
      <div className="st-radio-grid" role="radiogroup" aria-label={t('env.deployTitle')}>
        {deployCards.map((c, i) => {
          const badges = deployBadges(c.mode, uiMode, actualDeployMode);
          const selected = uiMode === c.mode;
          return (
            <button
              key={c.mode}
              ref={(el) => { deployCardRefs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={'st-radio-card' + (selected ? ' active' : '')}
              onClick={() => setUiMode(c.mode)}
              onKeyDown={(e) => onDeployKey(e, i)}
            >
              <span className="st-radio-head">
                <span className="st-radio-dot" />
                <span className="st-radio-name">{c.name}</span>
                {badges.current && <span className="st-radio-cur">{t('env.currentTag')}</span>}
                {badges.previewing && <span className="st-radio-prev">{t('env.previewTag')}</span>}
              </span>
              <span className="st-radio-body">
                <span className="st-radio-desc">{c.desc}</span>
                <span className="st-radio-spec"><b>{t('env.qdrant')}</b><span>{c.qdrant}</span></span>
                <span className="st-radio-spec"><b>{t('env.kg')}</b><span>{c.kg}</span></span>
              </span>
            </button>
          );
        })}
      </div>
  );

  return (
    <div className="st-panel">
      <PanelHead title={t('env.title')} sub={t('env.sub')} badge="dev" />

      {/* Deploy mode — radio cards; 「（目前）」 and the selection frame may disagree */}
      {/* One stable tree for both modes (Standard just drops the heading, per the 04 canvas):
          swapping wrappers would remount the radio cards and drop keyboard focus. */}
      <StSection icon={<Server size={16} />} title={t('env.deployTitle')} hideHead={isStd}>
        {deployGrid}
      </StSection>

      {/* Lightweight: read-only status */}
      {!isStd && kg && (
        <StSection icon={<HardDrive size={16} />} title={t('env.statusTitle')}>
          <div className="st-rows">
            <div className="st-row">
              <span className="st-row-key">{t('env.qdrantBackend')}</span>
              <span className="st-row-val">{t('env.qdrantLw')}</span>
            </div>
            <div className="st-row">
              <span className="st-row-key">{t('env.qdrantPath')}</span>
              <code className="st-row-val mono">{kg.qdrantLocalPath ?? '—'}</code>
            </div>
            <div className="st-row">
              <span className="st-row-key">{t('env.vectorCount')}</span>
              <code className={'st-row-val mono' + (kg.vectorCount == null ? ' muted' : '')}>
                {kg.vectorCount != null ? kg.vectorCount.toLocaleString() : '—'}
              </code>
            </div>
            <div className="st-row">
              <span className="st-row-key">{t('env.kgBackend')}</span>
              <span className="st-row-val">
                <span className="st-kgbadge">NetworkX</span>
                <span className="st-hint-inline">{t('env.kgFixed')}</span>
              </span>
            </div>
            <div className="st-row">
              <span className="st-row-key">{t('env.kgPath')}</span>
              <code className="st-row-val mono">{kg.persistencePath ?? '—'}</code>
            </div>
          </div>
          <div className="ss-stats-row">
            <div className="ss-stat">
              <span className="ss-stat-value">{kg.entityCount.toLocaleString()}</span>
              <span className="ss-stat-label">{t('env.entities')}</span>
            </div>
            <div className="ss-stat">
              <span className="ss-stat-value">{kg.relationCount.toLocaleString()}</span>
              <span className="ss-stat-label">{t('env.relations')}</span>
            </div>
            <div className="ss-stat">
              <span className="ss-stat-value">{kg.eventCount.toLocaleString()}</span>
              <span className="ss-stat-label">{t('env.events')}</span>
            </div>
          </div>
        </StSection>
      )}

      {/* Standard preview: banner first, then the form */}
      {isStd && (
        <>
          {isPreviewing && (
            <div className="st-banner warn">
              <span className="st-banner-ico"><AlertTriangle size={16} /></span>
              <span>{t('env.stWarn')}</span>
            </div>
          )}

          <div className="st-fields">
            <span className="st-label">{t('env.qdrantSvcTitle')}</span>
            <StandardField
              id="st-qdrant-url" name={t('env.qdrantUrl')}
              placeholder="http://localhost:6333" flag="restart"
            />
            <StandardField
              id="st-qdrant-key" name={t('env.qdrantKey')} optional={t('env.qdrantKeyOpt')}
              placeholder="••••••••" secret flag="restart"
            />
            <p className="st-note">{t('env.qdrantHint')}</p>
          </div>

          <div className="st-fields">
            <div className="st-fieldrow">
              <span className="st-label" style={{ flex: 1 }}>{t('env.kgBackendTitle')}</span>
              {kgSwitchIsLive
                ? <span className="st-flag live">{t('env.kgLiveFlag')}</span>
                : <span className="st-flag restart">{t('env.restartFlag')}</span>}
            </div>
            <div className="st-seg-wrap">
              <div className="ss-seg st-seg st-seg-kg" role="group" aria-label={t('env.kgBackendTitle')}>
                <button
                  type="button"
                  className={'ss-seg-item' + (kgBackend === 'networkx' ? ' active' : '')}
                  aria-pressed={kgBackend === 'networkx'}
                  onClick={() => handleKgBackendChange('networkx')}
                  disabled={switchMutation.isPending}
                >
                  NetworkX
                </button>
                <button
                  type="button"
                  className={'ss-seg-item' + (kgBackend === 'neo4j' ? ' active' : '')}
                  aria-pressed={kgBackend === 'neo4j'}
                  onClick={() => handleKgBackendChange('neo4j')}
                  disabled={switchMutation.isPending}
                >
                  Neo4j
                </button>
              </div>
              {switchMutation.isPending && (
                <span role="status" aria-label={t('common.loading')} style={{ display: 'inline-flex', color: 'var(--accent)' }}>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                </span>
              )}
            </div>
            {switchError && (
              <MigrationState kind="failed">
                <span className="st-mig-state-lead">{t('env.switchFailed')}</span>
                {switchError}
              </MigrationState>
            )}
            {/* Capability gap layer: below the segmented control, before the switch happens. */}
            <div aria-live="polite">
              <GapNotice layer={layer} />
            </div>
          </div>

          <div className="st-fields">
            <span className="st-label">{t('env.neoSectionTitle')}</span>
            <StandardField id="st-neo-url" name={t('env.neoUrl')} placeholder="bolt://localhost:7687" flag="restart" />
            <StandardField id="st-neo-user" name={t('env.neoUser')} placeholder="neo4j" flag="restart" />
            <StandardField id="st-neo-pass" name={t('env.neoPass')} placeholder="••••••••" secret flag="restart" />
            <p className="st-note">{t('env.neoNote')}</p>
          </div>
        </>
      )}

      {/* Migration — both modes. Two kinds of 「尚未實作」, drawn differently. */}
      <StSection icon={<ArrowRight size={16} />} title={t('env.migTitle')}>
        <div className="st-mig">
          {/* Permanent: dashed frame, dimmed, no button, no gate note */}
          <div className="st-mig-row never">
            <span className="st-mig-dir"><ArrowRight size={15} /></span>
            <div className="st-mig-body">
              <span className="st-mig-label">{t('env.migQdrant')}</span>
              <span className="st-mig-sub">{t('env.migQdrantSub')}</span>
            </div>
            <span className="st-flag never">{t('env.notImpl')}</span>
          </div>
          {/* Conditional: solid frame, button present but dimmed, gate stated */}
          {migRows.map((r) => (
            <div className="st-mig-row" key={r.key}>
              <span className="st-mig-dir">{r.arrow}</span>
              <div className="st-mig-body">
                <span className="st-mig-label" id={`st-mig-${r.key}-label`}>{r.label}</span>
                <span className="st-mig-sub" id={`st-mig-${r.key}-sub`}>{r.sub}</span>
                {!gate.met && <span className="st-mig-gate" id={`st-mig-${r.key}-gate`}>{t('env.gateNote')}</span>}
              </div>
              {gate.met && <span className="st-flag live">{t('env.kgLiveFlag')}</span>}
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary st-mig-run"
                aria-describedby={[`st-mig-${r.key}-label`, `st-mig-${r.key}-sub`, !gate.met && `st-mig-${r.key}-gate`]
                  .filter(Boolean).join(' ')}
                disabled={!gate.canRun}
                onClick={() => gate.canRun && migrateMutation.mutate(r.dir)}
              >
                {t('env.runMigration')}
              </button>
            </div>
          ))}
        </div>
        {migrateMutation.isPending && <MigrationState kind="running">{t('env.migrating')}</MigrationState>}
        {migrateMutation.isError && !migrationTaskId && (
          <MigrationState kind="failed">{migrateMutation.error.message}</MigrationState>
        )}
        {migrationTaskId && (
          <MigrationProgress
            task={migrationTask}
            pollError={migrationPollError}
            onDone={() => {
              setMigrationTaskId(null);
              queryClient.invalidateQueries({ queryKey: ['kg-status'] });
            }}
          />
        )}
        <p className="st-note">{t('env.migIdem')}</p>
      </StSection>

      {kg && (
        <div className="st-refresh-row">
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-ghost st-refresh"
            // aria-disabled, not disabled: a disabled button drops keyboard focus to <body>.
            onClick={() => { if (!refreshing) handleRefresh(); }}
            aria-disabled={refreshing}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} aria-hidden />
            {t('env.refresh')}
          </button>
          {refreshFailed && !refreshing && (
            <span className="st-failure-line" role="alert">
              <AlertTriangle size={16} />
              <span>{t('env.loadError')}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── About panel ──────────────────────────────────────────────

function PkgCol({ label, pkgs }: { label: string; pkgs: [string, string][] }) {
  return (
    <div className="st-pkg-col">
      <span className="st-label">{label}</span>
      {pkgs.map(([name, ver]) => (
        <div className="st-pkg-row" key={name}>
          <span className="st-pkg-name">{name}</span>
          <code className="st-pkg-ver">{ver}</code>
        </div>
      ))}
    </div>
  );
}

function AboutPanel() {
  const { t } = useTranslation('settings');
  const { data, isLoading, error, refetch } = useQuery<SettingsInfo>({
    queryKey: ['settings-info'],
    queryFn: fetchSettingsInfo,
  });

  // Keys keep the raw field names so they line up with .env; databaseUrl is shown exactly as
  // the backend masked it — no reveal toggle.
  const paths: [string, string][] = data ? [
    ['qdrantLocalPath', data.qdrantLocalPath],
    ['kgPersistencePath', data.kgPersistencePath],
    ['databaseUrl', data.databaseUrl],
    ['analysisCacheDbPath', data.analysisCacheDbPath],
  ] : [];

  return (
    <div className="st-panel">
      <PanelHead title={t('about.title')} />
      {isLoading ? (
        <PanelLoading />
      ) : error || !data ? (
        <PanelFailure message={t('about.loadError')} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="st-about-hero">
            <div className="st-about-logo">S</div>
            <div className="st-about-id">
              <span className="st-about-name">StorySphere</span>
              <span className="st-about-ver">
                v{data.appVersion}
                <span className="st-env-pill">{data.appEnv}</span>
              </span>
            </div>
          </div>
          <div className="st-pkg-cols">
            <PkgCol label={t('about.frontend')} pkgs={data.frontendPackages as [string, string][]} />
            <PkgCol label={t('about.backend')} pkgs={data.backendPackages as [string, string][]} />
          </div>
          <div className="st-path-block">
            <span className="st-label">{t('about.paths')}</span>
            {paths.map(([k, v]) => (
              <div className="st-path-row" key={k}>
                <code className="st-path-key">{k}</code>
                <code className="st-path-val">{v}</code>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Planned panel ────────────────────────────────────────────

/** Lightest empty state: icon + badge + title + one line. No CTA, no timeline. */
function PlannedPanel({ kind }: { kind: 'shortcuts' | 'experimental' }) {
  const { t } = useTranslation('settings');
  const isShortcuts = kind === 'shortcuts';
  return (
    <div className="st-panel">
      <div className="st-planned">
        <span className="st-planned-ico">
          {isShortcuts ? <Keyboard size={26} /> : <FlaskConical size={26} />}
        </span>
        <span className="st-badge planned">{t('planned.badge')}</span>
        <h2 className="st-planned-title">
          {isShortcuts ? t('planned.shortcutsTitle') : t('planned.experimentalTitle')}
        </h2>
        <p className="st-planned-sub">
          {isShortcuts ? t('planned.shortcutsSub') : t('planned.experimentalSub')}
        </p>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  // The panel lives in the hash (`/settings#llm` is where the 503「前往 LLM 設定 →」links land).
  // Switching replaces the entry: reload and deep links work, Back leaves the page.
  const { hash } = useLocation();
  const navigate = useNavigate();
  const active: PanelId = PANEL_IDS.find((id) => `#${id}` === hash) ?? 'appearance';
  const [migrationTaskId, setMigrationTaskId] = useState<string | null>(null);
  const setActive = (id: PanelId) => navigate({ hash: id }, { replace: true });

  const { data: settingsInfo } = useQuery<SettingsInfo>({
    queryKey: ['settings-info'],
    queryFn: fetchSettingsInfo,
  });

  const renderPanel = () => {
    switch (active) {
      case 'appearance':   return <AppearancePanel />;
      case 'language':     return <LanguagePanel />;
      case 'guidance':     return <GuidancePanel />;
      case 'llm':          return <LlmPanel />;
      case 'env':          return <EnvPanel migrationTaskId={migrationTaskId} setMigrationTaskId={setMigrationTaskId} />;
      case 'shortcuts':    return <PlannedPanel kind="shortcuts" />;
      case 'experimental': return <PlannedPanel kind="experimental" />;
      case 'about':        return <AboutPanel />;
    }
  };

  return (
    <div className="st-settings">
      <nav className="st-nav" aria-labelledby="st-nav-title">
        <div className="st-nav-head">
          <h1 className="st-nav-title" id="st-nav-title">{t('nav.title')}</h1>
          <div className="st-nav-divider" />
        </div>
        {NAV_GROUPS.map((g) => (
          <div className="st-nav-group" key={g.labelKey}>
            <span className="st-nav-group-label">{t(g.labelKey)}</span>
            {g.items.map((it) => (
              <button
                key={it.id}
                type="button"
                className={[
                  'st-nav-item',
                  active === it.id ? 'active' : '',
                  it.badge === 'planned' ? 'is-planned' : '',
                ].filter(Boolean).join(' ')}
                aria-current={active === it.id ? 'true' : undefined}
                onClick={() => setActive(it.id)}
              >
                <span className="st-nav-ico">{NAV_ICONS[it.id]}</span>
                <span className="st-nav-label">{t(it.labelKey)}</span>
                {it.badge && <span className={`st-badge ${it.badge}`}>{t(BADGE_KEY[it.badge])}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="st-nav-foot">
          StorySphere {settingsInfo ? `v${settingsInfo.appVersion}` : ''}
        </div>
      </nav>

      <div className="st-content" key={active}>
        {renderPanel()}
      </div>
    </div>
  );
}
