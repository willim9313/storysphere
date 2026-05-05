import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, RefreshCw, ArrowRight, CheckCircle, XCircle, Loader2, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '@/contexts/ThemeContext';
import {
  fetchKgStatus,
  switchKgMode,
  startMigration,
  fetchMigrationStatus,
  type KgStatus,
  type MigrationDirection,
} from '@/api/kgSettings';
import type { TaskStatus } from '@/api/types';

// ── Theme picker ────────────────────────────────────────────────

type ThemeOption = {
  id: Theme;
  nameKey: string;
  descKey: string;
  preview: { bg: string; accent: string; fg: string };
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'default',
    nameKey: 'theme.default',
    descKey: 'theme.defaultDesc',
    preview: { bg: '#faf8f4', accent: '#8b5e3c', fg: '#1c1814' },
  },
  {
    id: 'manuscript',
    nameKey: 'theme.manuscript',
    descKey: 'theme.manuscriptDesc',
    preview: { bg: '#f8f6f2', accent: '#000000', fg: '#0d0d0d' },
  },
  {
    id: 'minimal-ink',
    nameKey: 'theme.minimalInk',
    descKey: 'theme.minimalInkDesc',
    preview: { bg: '#ffffff', accent: '#000000', fg: '#000000' },
  },
  {
    id: 'pulp',
    nameKey: 'theme.pulp',
    descKey: 'theme.pulpDesc',
    preview: { bg: '#ffffff', accent: '#000000', fg: '#1a1a1a' },
  },
];

function ThemePicker() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Palette size={16} style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
          {t('theme.title')}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {THEME_OPTIONS.map((opt) => {
          const isActive = theme === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className="text-left rounded-lg p-3 transition-all"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: isActive
                  ? '2px solid var(--accent)'
                  : '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              {/* colour swatch */}
              <div
                className="flex gap-1 mb-2 rounded"
                style={{
                  height: 20,
                  backgroundColor: opt.preview.bg,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ width: '60%', backgroundColor: opt.preview.bg }} />
                <div style={{ width: '25%', backgroundColor: opt.preview.accent }} />
                <div style={{ width: '15%', backgroundColor: opt.preview.fg }} />
              </div>
              <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--fg-primary)' }}>
                {t(opt.nameKey)}
              </div>
              <div className="text-xs leading-snug" style={{ color: 'var(--fg-muted)' }}>
                {t(opt.descKey)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── KG settings ────────────────────────────────────────────────

function useKgStatus() {
  return useQuery<KgStatus>({
    queryKey: ['kg-status'],
    queryFn: fetchKgStatus,
    refetchInterval: 10_000,
  });
}

function useMigrationTask(taskId: string | null) {
  return useQuery<TaskStatus>({
    queryKey: ['kg-migration', taskId],
    queryFn: () => fetchMigrationStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'done' || s === 'error' ? false : 2000;
    },
  });
}

function StatCard({ label, value }: Readonly<{ label: string; value: number | string }>) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="text-xs mb-1" style={{ color: 'var(--fg-muted)' }}>{label}</div>
      <div className="text-xl font-semibold tabular-nums" style={{ color: 'var(--fg-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function ModeBadge({ mode }: Readonly<{ mode: string }>) {
  const isNeo4j = mode === 'neo4j';
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-semibold"
      style={{
        backgroundColor: isNeo4j ? 'var(--accent)' : 'var(--bg-tertiary)',
        color: isNeo4j ? 'white' : 'var(--fg-secondary)',
      }}
    >
      {isNeo4j ? 'Neo4j' : 'NetworkX'}
    </span>
  );
}

function MigrationProgress({ taskId, onDone }: Readonly<{ taskId: string; onDone: () => void }>) {
  const { t } = useTranslation('settings');
  const { data: task } = useMigrationTask(taskId);

  if (!task) return null;

  if (task.status === 'done') {
    const r = task.result as Record<string, number> | null;
    setTimeout(onDone, 3000);
    return (
      <div
        className="mt-3 rounded-lg p-3 flex items-start gap-2 text-sm"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <CheckCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-success)' }} />
        <div style={{ color: 'var(--fg-secondary)' }}>
          {t('migration.done', {
            entities: r?.entities ?? 0,
            relations: r?.relations ?? 0,
            events: r?.events ?? 0,
          })}
        </div>
      </div>
    );
  }

  if (task.status === 'error') {
    return (
      <div
        className="mt-3 rounded-lg p-3 flex items-start gap-2 text-sm"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <XCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-error)' }} />
        <div style={{ color: 'var(--fg-secondary)' }}>{t('migration.failed', { error: task.error })}</div>
      </div>
    );
  }

  if (task.status === 'running' || task.status === 'pending') {
    return (
      <div
        className="mt-3 rounded-lg p-3 flex items-center gap-2 text-sm"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--fg-muted)' }}>{t('migration.running')}</span>
      </div>
    );
  }

  return null;
}

// ── Page ────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('settings');
  const { data: kgStatus, isLoading, error, refetch } = useKgStatus();
  const [migrationTaskId, setMigrationTaskId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);

  const switchMutation = useMutation({
    mutationFn: (mode: 'networkx' | 'neo4j') => switchKgMode(mode),
    onSuccess: () => {
      setSwitchError(null);
      queryClient.invalidateQueries({ queryKey: ['kg-status'] });
    },
    onError: (err: Error) => setSwitchError(err.message),
  });

  const migrateMutation = useMutation({
    mutationFn: (direction: MigrationDirection) => startMigration(direction),
    onSuccess: (task) => {
      setMigrateError(null);
      setMigrationTaskId(task.taskId);
    },
    onError: (err: Error) => setMigrateError(err.message),
  });

  const currentMode = kgStatus?.mode ?? 'networkx';

  return (
    <div className="p-6 overflow-y-auto h-full max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}>
          {t('title')}
        </h2>
      </div>

      <ThemePicker />

      {/* KG Backend Section */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
            {t('kg.title')}
          </h3>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
            <Loader2 size={14} className="animate-spin" />
            {t('kg.loadingStatus')}
          </div>
        ) : error ? (
          <div className="text-sm" style={{ color: 'var(--color-error)' }}>{t('kg.loadError')}</div>
        ) : kgStatus ? (
          <>
            <div
              className="rounded-lg p-4 mb-4"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{t('kg.currentBackend')}</span>
                  <ModeBadge mode={currentMode} />
                </div>
                <button
                  onClick={() => refetch()}
                  className="rounded p-1 transition-colors"
                  style={{ color: 'var(--fg-muted)' }}
                  title={t('kg.refresh')}
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: kgStatus.graphDbConnected ? 'var(--color-success)' : 'var(--fg-muted)' }}
                />
                Neo4j {kgStatus.graphDbConnected ? t('kg.connected') : t('kg.disconnected')}
                {kgStatus.persistencePath && (
                  <span className="ml-2 truncate" style={{ maxWidth: 200 }}>
                    · {kgStatus.persistencePath}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard label={t('kg.entities')} value={kgStatus.entityCount} />
              <StatCard label={t('kg.relations')} value={kgStatus.relationCount} />
              <StatCard label={t('kg.events')} value={kgStatus.eventCount} />
            </div>

            <div className="mb-1">
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--fg-muted)' }}>
                {t('kg.switchBackend')}
              </div>
              <div className="flex gap-2">
                {(['networkx', 'neo4j'] as const).map((m) => (
                  <button
                    key={m}
                    disabled={currentMode === m || switchMutation.isPending}
                    onClick={() => switchMutation.mutate(m)}
                    className="px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
                    style={{
                      backgroundColor: currentMode === m ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: currentMode === m ? 'white' : 'var(--fg-secondary)',
                      border: '1px solid var(--border)',
                      cursor: currentMode === m ? 'default' : 'pointer',
                    }}
                  >
                    {m === 'networkx' ? 'NetworkX' : 'Neo4j'}
                  </button>
                ))}
                {switchMutation.isPending && (
                  <Loader2 size={16} className="animate-spin self-center ml-1" style={{ color: 'var(--accent)' }} />
                )}
              </div>
              {switchError && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--color-error)' }}>{switchError}</p>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--fg-muted)' }}>
                {t('kg.switchNote')}
              </p>
            </div>
          </>
        ) : null}
      </section>

      {/* Migration Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ArrowRight size={16} style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
            {t('migration.title')}
          </h3>
        </div>

        <div
          className="rounded-lg p-4"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <div className="text-xs mb-4" style={{ color: 'var(--fg-muted)' }}>
            {t('migration.idempotentNote')}
          </div>

          <div className="flex flex-col gap-2">
            <MigrationButton
              label={t('migration.nxToNeo4j')}
              sublabel={t('migration.nxToNeo4jSub')}
              disabled={migrateMutation.isPending || !!migrationTaskId}
              onClick={() => migrateMutation.mutate('nx_to_neo4j')}
            />
            <MigrationButton
              label={t('migration.neo4jToNx')}
              sublabel={t('migration.neo4jToNxSub')}
              disabled={migrateMutation.isPending || !!migrationTaskId}
              onClick={() => migrateMutation.mutate('neo4j_to_nx')}
            />
          </div>

          {migrateError && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-error)' }}>{migrateError}</p>
          )}

          {migrationTaskId && (
            <MigrationProgress
              taskId={migrationTaskId}
              onDone={() => {
                setMigrationTaskId(null);
                queryClient.invalidateQueries({ queryKey: ['kg-status'] });
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function MigrationButton({
  label,
  sublabel,
  disabled,
  onClick,
}: Readonly<{
  label: string;
  sublabel: string;
  disabled: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full text-left rounded-md px-3 py-2.5 transition-colors disabled:opacity-40"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <div className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{label}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>{sublabel}</div>
    </button>
  );
}
