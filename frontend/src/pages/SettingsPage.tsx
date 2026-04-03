import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, RefreshCw, ArrowRight, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
  fetchKgStatus,
  switchKgMode,
  startMigration,
  fetchMigrationStatus,
  type KgStatus,
  type MigrationDirection,
} from '@/api/kgSettings';
import type { TaskStatus } from '@/api/types';

// ── KG status hook ──────────────────────────────────────────────────────────

function useKgStatus() {
  return useQuery<KgStatus>({
    queryKey: ['kg-status'],
    queryFn: fetchKgStatus,
    refetchInterval: 10_000,
  });
}

// ── Migration task polling hook ─────────────────────────────────────────────

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

// ── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
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

// ── Backend mode badge ──────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: string }) {
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

// ── Migration progress ──────────────────────────────────────────────────────

function MigrationProgress({
  taskId,
  onDone,
}: {
  taskId: string;
  onDone: () => void;
}) {
  const { data: task } = useMigrationTask(taskId);

  if (!task) return null;

  const isDone = task.status === 'done';
  const isError = task.status === 'error';
  const isRunning = task.status === 'running' || task.status === 'pending';

  if (isDone) {
    const r = task.result as Record<string, number> | null;
    setTimeout(onDone, 3000);
    return (
      <div
        className="mt-3 rounded-lg p-3 flex items-start gap-2 text-sm"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <CheckCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#4ade80' }} />
        <div style={{ color: 'var(--fg-secondary)' }}>
          遷移完成：{r?.entities ?? 0} 實體，{r?.relations ?? 0} 關係，{r?.events ?? 0} 事件
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="mt-3 rounded-lg p-3 flex items-start gap-2 text-sm"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <XCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#f87171' }} />
        <div style={{ color: 'var(--fg-secondary)' }}>遷移失敗：{task.error}</div>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div
        className="mt-3 rounded-lg p-3 flex items-center gap-2 text-sm"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--fg-muted)' }}>遷移中…</span>
      </div>
    );
  }

  return null;
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient = useQueryClient();
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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h2
          className="text-lg font-bold"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg-primary)' }}
        >
          系統設定
        </h2>
      </div>

      {/* KG Backend Section */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--fg-primary)' }}>
            知識圖譜後端
          </h3>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
            <Loader2 size={14} className="animate-spin" />
            載入中…
          </div>
        ) : error ? (
          <div className="text-sm" style={{ color: '#f87171' }}>無法取得狀態</div>
        ) : kgStatus ? (
          <>
            {/* Current mode + connectivity */}
            <div
              className="rounded-lg p-4 mb-4"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>目前後端</span>
                  <ModeBadge mode={currentMode} />
                </div>
                <button
                  onClick={() => refetch()}
                  className="rounded p-1 transition-colors"
                  style={{ color: 'var(--fg-muted)' }}
                  title="重新整理"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: kgStatus.graphDbConnected ? '#4ade80' : '#6b7280' }}
                />
                Neo4j {kgStatus.graphDbConnected ? '已連線' : '未連線'}
                {kgStatus.persistencePath && (
                  <span className="ml-2 truncate" style={{ maxWidth: 200 }}>
                    · {kgStatus.persistencePath}
                  </span>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard label="實體" value={kgStatus.entityCount} />
              <StatCard label="關係" value={kgStatus.relationCount} />
              <StatCard label="事件" value={kgStatus.eventCount} />
            </div>

            {/* Mode switch */}
            <div className="mb-1">
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--fg-muted)' }}>
                切換查詢後端
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
                <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>{switchError}</p>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--fg-muted)' }}>
                切換後端不需重啟，但兩個後端的資料彼此獨立，需手動執行遷移。
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
            資料遷移
          </h3>
        </div>

        <div
          className="rounded-lg p-4"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <div className="text-xs mb-4" style={{ color: 'var(--fg-muted)' }}>
            遷移為冪等操作，重複執行不會產生重複資料。
          </div>

          <div className="flex flex-col gap-2">
            <MigrationButton
              label="NetworkX JSON → Neo4j"
              sublabel="將本機 JSON 匯入 Neo4j（MERGE）"
              disabled={migrateMutation.isPending || !!migrationTaskId}
              onClick={() => migrateMutation.mutate('nx_to_neo4j')}
            />
            <MigrationButton
              label="Neo4j → NetworkX JSON"
              sublabel="從 Neo4j 匯出至本機 JSON 檔"
              disabled={migrateMutation.isPending || !!migrationTaskId}
              onClick={() => migrateMutation.mutate('neo4j_to_nx')}
            />
          </div>

          {migrateError && (
            <p className="text-xs mt-2" style={{ color: '#f87171' }}>{migrateError}</p>
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
}: {
  label: string;
  sublabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
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
