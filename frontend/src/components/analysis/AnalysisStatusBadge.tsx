interface AnalysisStatusBadgeProps {
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | null;
}

const config: Record<string, { label: string; color: string; bg: string }> = {
  idle: { label: 'Not analyzed', color: 'var(--color-text-muted)', bg: 'var(--color-bg-secondary)' },
  pending: { label: 'Queued', color: 'var(--color-warning)', bg: 'var(--color-accent-subtle)' },
  running: { label: 'Analyzing...', color: 'var(--color-info)', bg: 'var(--color-accent-subtle)' },
  completed: { label: 'Done', color: 'var(--color-success)', bg: 'var(--color-accent-subtle)' },
  failed: { label: 'Failed', color: 'var(--color-error)', bg: 'var(--color-accent-subtle)' },
};

export function AnalysisStatusBadge({ status }: AnalysisStatusBadgeProps) {
  const s = config[status ?? 'idle'] ?? config.idle;
  return (
    <span
      className="inline-flex px-2 py-0.5 text-xs rounded-full font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}
