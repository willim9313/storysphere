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

function relTime(iso: string | null | undefined): string {
  if (!iso) return '已完成';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '已完成';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return '剛剛完成';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分鐘前完成`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前完成`;
  return `${Math.floor(h / 24)} 天前完成`;
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

  // Neutral = B&W theme only (chip outlined, accents → fg-primary).
  const chipBg = mono ? 'transparent' : meta.bg;
  const chipFg = mono ? 'var(--fg-secondary)' : meta.fg;
  const chipBorder = mono
    ? 'var(--border-width) var(--border-style) var(--border)'
    : '0px solid transparent';
  const labelFg = mono ? 'var(--fg-secondary)' : meta.fg;
  const labelBg = mono ? 'transparent' : meta.bg;
  const barColor = mono ? 'var(--fg-primary)' : meta.fg;

  const statusDot = isDone
    ? 'var(--color-success)'
    : isError
      ? 'var(--color-error)'
      : status === 'awaiting_review'
        ? 'var(--color-warning)'
        : meta.fg;
  const dotColor = mono && running ? 'var(--fg-primary)' : statusDot;

  const Icon = meta.Icon;
  const title = task.title || task.stage || '處理中';
  const errorText = navigable ? '失敗 · 前往該頁處理' : '失敗';

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
            {relTime(task.createdAt)}
          </div>
        )}

        {isError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
            <AlertTriangle size={12} style={{ color: 'var(--color-error)' }} />
            <span
              style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-error)' }}
            >
              {errorText}
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
