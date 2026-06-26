import { useState } from 'react';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import type { TaskStatus } from '@/api/tasks';
import { kindMeta } from './taskKinds';
import { taskRoute } from './taskRoute';

interface TaskRowProps {
  readonly task: TaskStatus;
  readonly onNavigate: (path: string) => void;
}

function dotColor(status: TaskStatus['status'], kindDot: string): string {
  switch (status) {
    case 'done':
      return 'var(--color-success)';
    case 'error':
      return 'var(--color-error)';
    case 'awaiting_review':
      return 'var(--color-warning)';
    default:
      return kindDot; // running / pending → kind colour
  }
}

export function TaskRow({ task, onNavigate }: TaskRowProps) {
  const [hover, setHover] = useState(false);
  const meta = kindMeta(task.kind);
  const route = taskRoute(task);
  const navigable = route !== null;

  const colorVar = meta.color ? `var(--entity-${meta.color}-dot)` : 'var(--fg-secondary)';
  const boxBg = meta.color ? `var(--entity-${meta.color}-bg)` : 'transparent';
  const boxBorder = meta.color ? 'transparent' : '1px solid var(--border)';
  const isTerminal = task.status === 'done' || task.status === 'error';
  const title = task.title || task.stage || '處理中';

  return (
    <button
      type="button"
      disabled={!navigable}
      onClick={navigable ? () => onNavigate(route) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-start w-full text-left rounded-md transition-colors"
      style={{
        gap: 10,
        padding: '8px 10px',
        background: hover && navigable ? 'var(--bg-tertiary)' : 'transparent',
        border: 0,
        cursor: navigable ? 'pointer' : 'default',
      }}
    >
      {/* kind icon block */}
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-md)',
          background: boxBg,
          border: boxBorder,
          color: colorVar,
        }}
      >
        <meta.Icon size={15} />
      </div>

      {/* two-line content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center" style={{ gap: 6 }}>
          <span
            className="truncate"
            style={{ fontSize: 13, color: 'var(--fg-primary)' }}
          >
            {title}
          </span>
          <span
            className="flex-shrink-0"
            style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 'var(--radius-md)',
              background: boxBg,
              color: colorVar,
            }}
          >
            {meta.label}
          </span>
        </div>

        {/* second line by status */}
        {task.status === 'error' ? (
          <div
            className="flex items-center"
            style={{ gap: 4, marginTop: 3, color: 'var(--color-error)', fontSize: 12 }}
          >
            <AlertTriangle size={12} />
            <span style={{ fontWeight: 600 }}>失敗</span>
          </div>
        ) : task.status === 'done' ? (
          <div style={{ marginTop: 3, fontSize: 12, color: 'var(--fg-muted)' }}>
            已完成
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            <div className="flex items-center" style={{ gap: 6 }}>
              <div
                className="flex-1"
                style={{
                  height: 4,
                  borderRadius: 999,
                  background: 'var(--bg-tertiary)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, task.progress))}%`,
                    height: '100%',
                    background: colorVar,
                  }}
                />
              </div>
              <span
                style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}
              >
                {task.progress}%
              </span>
            </div>
            {task.stage && (
              <div
                className="truncate"
                style={{ marginTop: 2, fontSize: 11, color: 'var(--fg-muted)' }}
              >
                {task.stage}
              </div>
            )}
          </div>
        )}
      </div>

      {/* status dot + hover chevron */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ gap: 4, marginTop: 2 }}
      >
        {navigable && hover && (
          <ChevronRight size={14} style={{ color: 'var(--fg-muted)' }} />
        )}
        <span
          className={!isTerminal ? 'animate-pulse' : undefined}
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: dotColor(task.status, colorVar),
          }}
        />
      </div>
    </button>
  );
}
