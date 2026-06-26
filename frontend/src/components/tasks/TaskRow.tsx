import { useState } from 'react';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import type { TaskStatus } from '@/api/tasks';
import { kindMeta } from './taskKinds';
import { taskRoute } from './taskRoute';

interface TaskRowProps {
  readonly task: TaskStatus;
  readonly mono: boolean;
  readonly onNavigate: (path: string) => void;
}

export function TaskRow({ task, mono, onNavigate }: TaskRowProps) {
  const [hover, setHover] = useState(false);
  const meta = kindMeta(task.kind);
  const route = taskRoute(task);
  const navigable = route !== null;

  const status = task.status;
  const running = status === 'running' || status === 'awaiting_review' || status === 'pending';
  const isDone = status === 'done';
  const isError = status === 'error';

  // Neutral treatment = B&W theme OR unknown kind (no entity colour).
  const neutral = mono || !meta.color;
  const iconBg = meta.color ? `var(--entity-${meta.color}-bg)` : 'transparent';
  const iconFg = meta.color ? `var(--entity-${meta.color}-dot)` : 'var(--fg-secondary)';

  const chipBg = neutral ? 'transparent' : iconBg;
  const chipFg = neutral ? 'var(--fg-secondary)' : iconFg;
  const chipBorder = neutral
    ? 'var(--border-width) var(--border-style) var(--border)'
    : '0px solid transparent';
  const labelFg = neutral ? 'var(--fg-secondary)' : iconFg;
  const labelBg = neutral ? 'transparent' : iconBg;
  const barColor = neutral ? 'var(--fg-primary)' : iconFg;

  const statusDot = isDone
    ? 'var(--color-success)'
    : isError
      ? 'var(--color-error)'
      : status === 'awaiting_review'
        ? 'var(--color-warning)'
        : meta.color
          ? `var(--entity-${meta.color}-dot)`
          : 'var(--fg-muted)';
  const dotColor = neutral && running ? 'var(--fg-primary)' : statusDot;

  const Icon = meta.Icon;
  const title = task.title || task.stage || '處理中';
  const doneLabel = isError ? '失敗' : '已完成';

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={navigable ? () => onNavigate(route) : undefined}
      style={{
        display: 'flex',
        gap: 10,
        padding: '9px 12px',
        alignItems: 'flex-start',
        borderRadius: 'var(--radius-md)',
        cursor: navigable ? 'pointer' : 'default',
        transition: 'background-color var(--transition-fast)',
        background: hover && navigable ? 'var(--bg-tertiary)' : 'transparent',
      }}
    >
      {/* kind chip */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-md)',
          background: chipBg,
          color: chipFg,
          border: chipBorder,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Icon size={15} />
      </div>

      {/* content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--fg-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '.02em',
              color: labelFg,
              background: labelBg,
              border: chipBorder,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              flexShrink: 0,
            }}
          >
            {meta.label}
          </span>
        </div>

        {running && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--bg-tertiary)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, task.progress))}%`,
                    height: '100%',
                    borderRadius: 2,
                    background: barColor,
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--fg-secondary)',
                  flexShrink: 0,
                }}
              >
                {task.progress}%
              </span>
            </div>
            {task.stage && (
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  marginTop: 4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {task.stage}
              </div>
            )}
          </>
        )}

        {isDone && (
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              color: 'var(--fg-muted)',
              marginTop: 5,
            }}
          >
            {doneLabel}
          </div>
        )}

        {isError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
            <AlertTriangle size={12} style={{ color: 'var(--color-error)' }} />
            <span
              style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-error)' }}
            >
              {doneLabel}
            </span>
          </div>
        )}
      </div>

      {/* status dot */}
      <span
        className={running ? 'animate-pulse' : undefined}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          marginTop: 6,
          flexShrink: 0,
        }}
      />

      {/* hover chevron (rendered when navigable, fades in) */}
      {navigable && (
        <ChevronRight
          size={14}
          style={{
            color: 'var(--fg-muted)',
            marginTop: 4,
            marginLeft: -3,
            flexShrink: 0,
            opacity: hover ? 1 : 0,
            transition: 'opacity var(--transition-fast)',
          }}
        />
      )}
    </div>
  );
}
