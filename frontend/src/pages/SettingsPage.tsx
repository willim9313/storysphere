import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Palette, Languages, Cpu, Server, Database, Info, Keyboard,
  FlaskConical, Check, ArrowRight, ArrowLeft, AlertTriangle,
  HardDrive, Network, Loader2, Folder, Type, CheckCircle, XCircle,
  RefreshCw,
} from 'lucide-react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';
import {
  fetchKgStatus, switchKgMode, startMigration, fetchMigrationStatus,
  type KgStatus, type MigrationDirection,
} from '@/api/kgSettings';
import { fetchSettingsInfo, type SettingsInfo } from '@/api/settingsInfo';
import type { TaskStatus } from '@/api/types';
import '@/styles/settings.css';

// ── Nav model ───────────────────────────────────────────────

type PanelId = 'appearance' | 'language' | 'llm' | 'env' | 'shortcuts' | 'experimental' | 'about';

const NAV_GROUPS: { labelKey: string; items: { id: PanelId; labelKey: string; badge?: 'dev' | 'merged' | 'planned' }[] }[] = [
  {
    labelKey: 'nav.groupPrefs',
    items: [
      { id: 'appearance', labelKey: 'nav.appearance' },
      { id: 'language', labelKey: 'nav.language', badge: 'merged' },
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

const NAV_ICONS: Record<PanelId, React.ReactNode> = {
  appearance: <Palette size={15} />,
  language: <Languages size={15} />,
  llm: <Cpu size={15} />,
  env: <Server size={15} />,
  shortcuts: <Keyboard size={15} />,
  experimental: <FlaskConical size={15} />,
  about: <Info size={15} />,
};

// ── Shared helpers ───────────────────────────────────────────

function PanelHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="st-panel-head">
      <h2 className="st-panel-title">{title}</h2>
      {sub && <p className="st-panel-sub">{sub}</p>}
    </div>
  );
}

function StSection({ icon, title, note, children }: {
  icon?: React.ReactNode; title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <section className="st-section">
      <div className="st-section-head">
        {icon && <span className="st-section-ico">{icon}</span>}
        <h3 className="st-section-title">{title}</h3>
      </div>
      {children}
      {note && <p className="st-section-note">{note}</p>}
    </section>
  );
}

// ── Theme previews (literal swatches — documented hex exception for cross-theme preview) ──

// Swatch strips follow the design kit's .ss-theme-swatch spec:
// four equal bands — bg-primary / bg-secondary / bg-tertiary / accent.
const THEME_SWATCHES: Record<Theme, { colors: string[]; firstBandBorder?: string }> = {
  warm: { colors: ['#f8f3e7', '#f1e8d5', '#e9ddc6', '#b05a34'] },
  ink: { colors: ['#ffffff', '#f6f6f4', '#ececea', '#151515'], firstBandBorder: '1px solid #1a1a1a' },
};

function ThemePreview({ id }: { id: Theme }) {
  const swatch = THEME_SWATCHES[id];
  return (
    <div className="st-theme-preview" style={{ display: 'flex' }}>
      {swatch.colors.map((c, i) => (
        <span
          key={c}
          style={{
            flex: 1,
            background: c,
            borderRight: i === 0 ? swatch.firstBandBorder : undefined,
          }}
        />
      ))}
    </div>
  );
}

// ── Migration progress ───────────────────────────────────────

function MigrationProgress({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const { t } = useTranslation('settings');
  const { data: task } = useQuery<TaskStatus>({
    queryKey: ['kg-migration', taskId],
    queryFn: () => fetchMigrationStatus(taskId),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'done' || s === 'error' ? false : 2000;
    },
  });

  useEffect(() => {
    if (task?.status !== 'done') return;
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [task?.status, onDone]);

  if (!task) return null;

  if (task.status === 'done') {
    const r = task.result as Record<string, number> | null;
    return (
      <div className="st-mig-progress">
        <CheckCircle size={16} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: 1 }} />
        <span style={{ color: 'var(--fg-secondary)' }}>
          {t('env.migTitle')} — {r?.entities ?? 0} {t('env.entities')}、{r?.relations ?? 0} {t('env.relations')}、{r?.events ?? 0} {t('env.events')}
        </span>
      </div>
    );
  }
  if (task.status === 'error') {
    return (
      <div className="st-mig-progress">
        <XCircle size={16} style={{ color: 'var(--color-error)', flexShrink: 0, marginTop: 1 }} />
        <span style={{ color: 'var(--fg-secondary)' }}>{task.error}</span>
      </div>
    );
  }
  return (
    <div className="st-mig-progress">
      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ color: 'var(--fg-muted)' }}>{t('env.migrating')}</span>
    </div>
  );
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
          {THEME_OPTS.map((o) => (
            <button
              key={o.id}
              className={'st-theme-card' + (theme === o.id ? ' active' : '')}
              onClick={() => setTheme(o.id)}
            >
              {theme === o.id && (
                <span className="st-theme-current">
                  <Check size={10} strokeWidth={3} />
                  {t('appearance.current')}
                </span>
              )}
              <ThemePreview id={o.id} />
              <div className="st-theme-meta">
                <div className="st-theme-name">{t(o.nameKey)}</div>
                <div className="st-theme-desc">{t(o.descKey)}</div>
              </div>
            </button>
          ))}
        </div>
      </StSection>
    </div>
  );
}

// ── Language panel ───────────────────────────────────────────

function LanguagePanel() {
  const { t, i18n } = useTranslation('settings');
  const lang = i18n.language;

  return (
    <div className="st-panel">
      <PanelHead title={t('language.title')} sub={t('language.sub')} />
      <div className="st-card">
        <div className="st-field">
          <div className="st-field-label">
            <Languages size={15} style={{ color: 'var(--accent)' }} />
            {t('language.uiLanguage')}
          </div>
          <div className="st-pill-toggle">
            <button
              className={'st-pill' + (lang === 'zh-TW' ? ' active' : '')}
              onClick={() => i18n.changeLanguage('zh-TW')}
            >
              {t('language.zhTW')}
            </button>
            <button
              className={'st-pill' + (lang === 'en' ? ' active' : '')}
              onClick={() => i18n.changeLanguage('en')}
            >
              {t('language.en')}
            </button>
          </div>
          <p className="st-field-hint">{t('language.uiLanguageHint')}</p>
        </div>
        <div className="st-field">
          <div className="st-field-label">
            <Cpu size={15} style={{ color: 'var(--fg-muted)' }} />
            {t('language.outputLanguage')}
            <span className="st-tag-soon">{t('language.soon')}</span>
          </div>
          <div className="st-pill-toggle">
            <button className="st-pill active" disabled>{t('language.followUi')}</button>
            <button className="st-pill" disabled>{t('language.custom')}</button>
          </div>
          <p className="st-field-hint">{t('language.outputLanguageHint')}</p>
        </div>
      </div>
    </div>
  );
}

// ── LLM panel ────────────────────────────────────────────────

function LlmPanel() {
  const { t } = useTranslation('settings');
  const { data, isLoading, error } = useQuery<SettingsInfo>({
    queryKey: ['settings-info'],
    queryFn: fetchSettingsInfo,
  });

  return (
    <div className="st-panel">
      <PanelHead title={t('llm.title')} sub={t('llm.sub')} />
      <StSection icon={<Cpu size={16} />} title={t('llm.sectionTitle')} note={t('llm.note')}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)', fontSize: 'var(--font-size-sm)' }}>
            <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
          </div>
        ) : error || !data ? (
          <div style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-sm)' }}>{t('llm.loadError')}</div>
        ) : (
          <div className="st-kv">
            <div className="st-kv-key">{t('llm.provider')}</div>
            <div className="st-kv-val">{data.primaryLlmProvider}</div>
            <div className="st-kv-key">{t('llm.primaryModel')}</div>
            <div className="st-kv-val mono">{data.primaryModel}</div>
            <div className="st-kv-key">{t('llm.analysisTemp')}</div>
            <div className="st-kv-val mono">{data.analysisTemperature}</div>
            <div className="st-kv-key">{t('llm.chatTemp')}</div>
            <div className="st-kv-val mono">{data.chatAgentTemperature}</div>
            <div className="st-kv-key">{t('llm.localModel')}</div>
            <div className="st-kv-val mono">{data.localLlmModel}</div>
          </div>
        )}
      </StSection>
    </div>
  );
}

// ── Environment panel ────────────────────────────────────────

function EnvPanel() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();

  const { data: kg, isLoading: kgLoading, error: kgError, refetch } = useQuery<KgStatus>({
    queryKey: ['kg-status'],
    queryFn: fetchKgStatus,
    refetchInterval: 15_000,
  });

  const [uiModeOverride, setUiMode] = useState<'lightweight' | 'standard' | null>(null);
  const [kgBackendOverride, setKgBackendState] = useState<'networkx' | 'neo4j' | null>(null);
  const uiMode = uiModeOverride ?? (kg?.deployMode as 'lightweight' | 'standard') ?? 'lightweight';
  const kgBackend = kgBackendOverride ?? (kg?.mode as 'networkx' | 'neo4j') ?? 'networkx';
  const [migrationTaskId, setMigrationTaskId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const switchMutation = useMutation({
    mutationFn: (mode: 'networkx' | 'neo4j') => switchKgMode(mode),
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
    onSuccess: (task) => setMigrationTaskId(task.taskId),
    onError: () => setMigrationTaskId(null),
  });

  const handleKgBackendChange = (mode: 'networkx' | 'neo4j') => {
    setKgBackendState(mode);
    if (uiMode === 'standard') {
      switchMutation.mutate(mode);
    }
  };

  const isStd = uiMode === 'standard';
  const actualDeployMode = kg?.deployMode ?? 'lightweight';
  const kgEnabled = isStd && kgBackend === 'neo4j' && !migrateMutation.isPending && !migrationTaskId;

  return (
    <div className="st-panel">
      <PanelHead title={t('env.title')} sub={t('env.sub')} />

      {/* A. Deploy mode radio cards */}
      <StSection icon={<Server size={16} />} title={t('env.deployTitle')}>
        {kgLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)', fontSize: 'var(--font-size-sm)' }}>
            <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
          </div>
        ) : kgError ? (
          <div style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-sm)' }}>{t('env.loadError')}</div>
        ) : (
          <div className="st-radio-grid">
            {/* Lightweight */}
            <button
              className={'st-radio-card' + (!isStd ? ' active' : '')}
              onClick={() => setUiMode('lightweight')}
            >
              <div className="st-radio-head">
                <span className="st-radio-dot" />
                <span className="st-radio-name">{t('env.lightweight')}</span>
                {actualDeployMode === 'lightweight' && (
                  <span className="st-radio-cur">{t('env.currentTag')}</span>
                )}
              </div>
              <div className="st-radio-desc">{t('env.lwDesc')}</div>
              <div className="st-radio-specs">
                <div className="st-radio-spec"><b>{t('env.qdrant')}</b><span>{t('env.qdrantLw')}</span></div>
                <div className="st-radio-spec"><b>{t('env.kg')}</b><span>{t('env.kgLw')}</span></div>
              </div>
            </button>
            {/* Standard */}
            <button
              className={'st-radio-card' + (isStd ? ' active' : '')}
              onClick={() => setUiMode('standard')}
            >
              <div className="st-radio-head">
                <span className="st-radio-dot" />
                <span className="st-radio-name">{t('env.standard')}</span>
                {actualDeployMode === 'standard' && (
                  <span className="st-radio-cur">{t('env.currentTag')}</span>
                )}
              </div>
              <div className="st-radio-desc">{t('env.stDesc')}</div>
              <div className="st-radio-specs">
                <div className="st-radio-spec"><b>{t('env.qdrant')}</b><span>{t('env.qdrantSt')}</span></div>
                <div className="st-radio-spec"><b>{t('env.kg')}</b><span>{t('env.kgSt')}</span></div>
              </div>
            </button>
          </div>
        )}
      </StSection>

      {/* B. Lightweight read-only status */}
      {!isStd && kg && (
        <StSection icon={<HardDrive size={16} />} title={t('env.statusTitle')}>
          <div className="st-kv" style={{ marginBottom: 16 }}>
            <div className="st-kv-key">{t('env.qdrantBackend')}</div>
            <div className="st-kv-val">{t('env.qdrantLw')}</div>
            <div className="st-kv-key">{t('env.qdrantPath')}</div>
            <div className="st-kv-val mono">{kg.qdrantLocalPath ?? '—'}</div>
            <div className="st-kv-key">{t('env.vectorCount')}</div>
            <div className="st-kv-val mono">
              {kg.vectorCount != null ? kg.vectorCount.toLocaleString() : '—'}
            </div>
            <div className="st-kv-key">{t('env.kgBackend')}</div>
            <div className="st-kv-val">
              <span className="st-modebadge nx">NetworkX</span>
              <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--font-size-2xs)', marginLeft: 8 }}>{t('env.kgFixed')}</span>
            </div>
            <div className="st-kv-key">{t('env.kgPath')}</div>
            <div className="st-kv-val mono">{kg.persistencePath ?? '—'}</div>
          </div>
          <div className="st-stats">
            <div className="st-stat">
              <div className="st-stat-label">{t('env.entities')}</div>
              <div className="st-stat-val">{kg.entityCount.toLocaleString()}</div>
            </div>
            <div className="st-stat">
              <div className="st-stat-label">{t('env.relations')}</div>
              <div className="st-stat-val">{kg.relationCount.toLocaleString()}</div>
            </div>
            <div className="st-stat">
              <div className="st-stat-label">{t('env.events')}</div>
              <div className="st-stat-val">{kg.eventCount.toLocaleString()}</div>
            </div>
          </div>
        </StSection>
      )}

      {/* C. Standard conditional config */}
      {isStd && (
        <>
          <div className="st-banner warn" style={{ marginBottom: 28 }}>
            <span className="st-banner-ico"><AlertTriangle size={16} /></span>
            <span>{t('env.stWarn')}</span>
          </div>

          <StSection icon={<Database size={16} />} title={t('env.qdrantSvcTitle')}>
            <div className="st-card">
              <div className="st-input-row">
                <label className="st-input-label">
                  {t('env.qdrantUrl')}
                  <span className="st-input-flag restart">{t('env.restartFlag')}</span>
                </label>
                <input className="st-input" placeholder="http://localhost:6333" />
              </div>
              <div className="st-input-row">
                <label className="st-input-label">
                  {t('env.qdrantKey')}
                  <span style={{ color: 'var(--fg-muted)', fontWeight: 400, fontSize: 'var(--font-size-2xs)' }}>{t('env.qdrantKeyOpt')}</span>
                  <span className="st-input-flag restart">{t('env.restartFlag')}</span>
                </label>
                <input className="st-input" type="password" placeholder="••••••••" />
              </div>
              <p className="st-input-note">{t('env.qdrantHint')}</p>
            </div>
          </StSection>

          <StSection icon={<Network size={16} />} title={t('env.kgBackendTitle')}>
            <div className="st-card">
              <div className="st-input-label" style={{ marginBottom: 10 }}>
                {t('env.kgBackend')}
                <span className="st-input-flag live">{t('env.kgLiveFlag')}</span>
              </div>
              <div className="st-seg">
                <button
                  className={'st-seg-btn' + (kgBackend === 'networkx' ? ' active' : '')}
                  onClick={() => handleKgBackendChange('networkx')}
                  disabled={switchMutation.isPending}
                >
                  NetworkX
                </button>
                <button
                  className={'st-seg-btn' + (kgBackend === 'neo4j' ? ' active' : '')}
                  onClick={() => handleKgBackendChange('neo4j')}
                  disabled={switchMutation.isPending}
                >
                  Neo4j
                </button>
                {switchMutation.isPending && (
                  <Loader2 size={14} className="animate-spin" style={{ alignSelf: 'center', marginLeft: 8, color: 'var(--accent)' }} />
                )}
              </div>
              {switchError && (
                <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 6, color: 'var(--color-error)' }}>{switchError}</p>
              )}
              <p className="st-input-note" style={{ marginTop: 8 }}>{t('env.neoNote')}</p>

              {kgBackend === 'neo4j' && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: 'var(--border-width) var(--border-style) var(--border)' }}>
                  <div className="st-input-row">
                    <label className="st-input-label">
                      {t('env.neoUrl')}
                      <span className="st-input-flag restart">{t('env.restartFlag')}</span>
                    </label>
                    <input className="st-input" placeholder="bolt://localhost:7687" />
                  </div>
                  <div className="st-input-row">
                    <label className="st-input-label">
                      {t('env.neoUser')}
                      <span className="st-input-flag restart">{t('env.restartFlag')}</span>
                    </label>
                    <input className="st-input" placeholder="neo4j" />
                  </div>
                  <div className="st-input-row">
                    <label className="st-input-label">
                      {t('env.neoPass')}
                      <span className="st-input-flag restart">{t('env.restartFlag')}</span>
                    </label>
                    <input className="st-input" type="password" placeholder="••••••••" />
                  </div>
                </div>
              )}
            </div>
          </StSection>
        </>
      )}

      {/* D. Migration — both modes, KG enabled only when Standard + Neo4j */}
      <StSection icon={<ArrowRight size={16} />} title={t('env.migTitle')} note={t('env.migIdem')}>
        <div className="st-mig">
          {/* Qdrant migration: always disabled (not yet implemented) */}
          <button className="st-mig-row" disabled title={t('env.notImpl')}>
            <span className="st-mig-dir"><ArrowRight size={16} /></span>
            <span className="st-mig-body">
              <span className="st-mig-label">{t('env.migQdrant')}</span>
              <span className="st-mig-sub">{t('env.migQdrantSub')}</span>
            </span>
            <span className="st-mig-flag">{t('env.notImpl')}</span>
          </button>
          {/* KG: NetworkX → Neo4j */}
          <button
            className="st-mig-row"
            disabled={!kgEnabled}
            onClick={() => kgEnabled && migrateMutation.mutate('nx_to_neo4j')}
            title={!kgEnabled ? t('env.notImpl') : undefined}
          >
            <span className="st-mig-dir"><ArrowRight size={16} /></span>
            <span className="st-mig-body">
              <span className="st-mig-label">{t('env.migNxNeo')}</span>
              <span className="st-mig-sub">{t('env.migNxNeoSub')}</span>
            </span>
            <span className="st-mig-flag">{kgEnabled ? t('env.kgLiveFlag') : t('env.notImpl')}</span>
          </button>
          {/* KG: Neo4j → NetworkX */}
          <button
            className="st-mig-row"
            disabled={!kgEnabled}
            onClick={() => kgEnabled && migrateMutation.mutate('neo4j_to_nx')}
            title={!kgEnabled ? t('env.notImpl') : undefined}
          >
            <span className="st-mig-dir"><ArrowLeft size={16} /></span>
            <span className="st-mig-body">
              <span className="st-mig-label">{t('env.migNeoNx')}</span>
              <span className="st-mig-sub">{t('env.migNeoNxSub')}</span>
            </span>
            <span className="st-mig-flag">{kgEnabled ? t('env.kgLiveFlag') : t('env.notImpl')}</span>
          </button>
        </div>
        {migrationTaskId && (
          <MigrationProgress
            taskId={migrationTaskId}
            onDone={() => {
              setMigrationTaskId(null);
              queryClient.invalidateQueries({ queryKey: ['kg-status'] });
            }}
          />
        )}
      </StSection>

      {/* Refresh button */}
      {kg && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => refetch()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <RefreshCw size={12} />
            {t('env.refresh')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── About panel ──────────────────────────────────────────────

function AboutPanel() {
  const { t } = useTranslation('settings');
  const { data, isLoading, error } = useQuery<SettingsInfo>({
    queryKey: ['settings-info'],
    queryFn: fetchSettingsInfo,
  });

  return (
    <div className="st-panel">
      <PanelHead title={t('about.title')} sub={t('about.sub')} />

      <section className="st-section">
        <div className="st-about-hero">
          <div className="st-about-logo">S</div>
          <div>
            <div className="st-about-name">StorySphere</div>
            {data && (
              <div className="st-about-ver">
                v{data.appVersion}
                <span className="st-env-pill">{data.appEnv}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)', fontSize: 'var(--font-size-sm)' }}>
          <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
        </div>
      ) : error || !data ? (
        <div style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-sm)' }}>{t('about.loadError')}</div>
      ) : (
        <>
          <StSection icon={<Type size={16} />} title={t('about.frontend')}>
            <div className="st-card muted">
              <div className="st-pkg-grid">
                {data.frontendPackages.map(([name, ver]) => (
                  <div className="st-pkg-row" key={name}>
                    <span className="st-pkg-name">{name}</span>
                    <span className="st-pkg-ver">{ver}</span>
                  </div>
                ))}
              </div>
            </div>
          </StSection>

          <StSection icon={<Server size={16} />} title={t('about.backend')}>
            <div className="st-card muted">
              <div className="st-pkg-grid">
                {data.backendPackages.map(([name, ver]) => (
                  <div className="st-pkg-row" key={name}>
                    <span className="st-pkg-name">{name}</span>
                    <span className="st-pkg-ver">{ver}</span>
                  </div>
                ))}
              </div>
            </div>
          </StSection>

          <StSection icon={<Folder size={16} />} title={t('about.paths')}>
            <div className="st-kv">
              <div className="st-kv-key" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>qdrantLocalPath</div>
              <div className="st-kv-val mono">{data.qdrantLocalPath}</div>
              <div className="st-kv-key" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>kgPersistencePath</div>
              <div className="st-kv-val mono">{data.kgPersistencePath}</div>
              <div className="st-kv-key" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>databaseUrl</div>
              <div className="st-kv-val mono">{data.databaseUrl}</div>
              <div className="st-kv-key" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>analysisCacheDbPath</div>
              <div className="st-kv-val mono">{data.analysisCacheDbPath}</div>
            </div>
          </StSection>
        </>
      )}
    </div>
  );
}

// ── Planned panel ────────────────────────────────────────────

function PlannedPanel({ kind }: { kind: 'shortcuts' | 'experimental' }) {
  const { t } = useTranslation('settings');
  const isShortcuts = kind === 'shortcuts';
  return (
    <div className="st-panel">
      <div className="st-empty">
        <div className="st-empty-ico">
          {isShortcuts ? <Keyboard size={26} strokeWidth={1.6} /> : <FlaskConical size={26} strokeWidth={1.6} />}
        </div>
        <div className="st-empty-badge">{t('planned.badge')}</div>
        <div className="st-empty-title">
          {isShortcuts ? t('planned.shortcutsTitle') : t('planned.experimentalTitle')}
        </div>
        <div className="st-empty-sub">
          {isShortcuts ? t('planned.shortcutsSub') : t('planned.experimentalSub')}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  const [active, setActive] = useState<PanelId>('appearance');

  const { data: settingsInfo } = useQuery<SettingsInfo>({
    queryKey: ['settings-info'],
    queryFn: fetchSettingsInfo,
  });

  const renderPanel = () => {
    switch (active) {
      case 'appearance':   return <AppearancePanel />;
      case 'language':     return <LanguagePanel />;
      case 'llm':          return <LlmPanel />;
      case 'env':          return <EnvPanel />;
      case 'shortcuts':    return <PlannedPanel kind="shortcuts" />;
      case 'experimental': return <PlannedPanel kind="experimental" />;
      case 'about':        return <AboutPanel />;
    }
  };

  return (
    <div className="st-settings">
      {/* 172px left nav */}
      <nav className="st-nav" data-variant="bar">
        <div className="st-nav-title">{t('nav.title')}</div>
        <div className="st-nav-divider" />
        {NAV_GROUPS.map((g) => (
          <div className="st-nav-group" key={g.labelKey}>
            <div className="st-nav-group-label">{t(g.labelKey)}</div>
            {g.items.map((it) => (
              <button
                key={it.id}
                className={[
                  'st-nav-item',
                  active === it.id ? 'active' : '',
                  it.badge === 'planned' ? 'is-planned' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setActive(it.id)}
              >
                <span className="st-nav-ico">{NAV_ICONS[it.id]}</span>
                <span className="st-nav-label">{t(it.labelKey)}</span>
                {it.badge && (
                  <span className={`st-nav-badge ${it.badge}`}>
                    {t(`nav.badge${it.badge.charAt(0).toUpperCase()}${it.badge.slice(1)}`)}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
        <div className="st-nav-foot">
          StorySphere {settingsInfo ? `v${settingsInfo.appVersion}` : ''}
        </div>
      </nav>

      {/* Content area */}
      <div className="st-content" key={active}>
        {renderPanel()}
      </div>
    </div>
  );
}
