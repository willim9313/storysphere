interface TaskProgressBarProps {
  status: 'pending' | 'running' | 'completed' | 'failed' | null;
  error?: string | null;
}

const statusLabels: Record<string, string> = {
  pending: 'Queued...',
  running: 'Processing...',
  completed: 'Complete!',
  failed: 'Failed',
};

export function TaskProgressBar({ status, error }: TaskProgressBarProps) {
  if (!status) return null;

  const isActive = status === 'pending' || status === 'running';
  const isFailed = status === 'failed';

  return (
    <div className="mt-4">
      <div
        className="h-1 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: status === 'completed' ? '100%' : isActive ? '60%' : '100%',
            backgroundColor: isFailed ? 'var(--color-error)' : 'var(--color-accent)',
            animation: isActive ? 'shimmer 1.5s infinite' : 'none',
          }}
        />
      </div>
      <p
        className="text-sm mt-2"
        style={{ color: isFailed ? 'var(--color-error)' : 'var(--color-text-secondary)' }}
      >
        {isFailed && error ? error : statusLabels[status] ?? status}
      </p>
      <style>{`
        @keyframes shimmer {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
