import { ChevronRight, AlertTriangle } from 'lucide-react';
import type { TaskStatus } from '@/api/tasks';
import { kindMeta, kindVars } from './taskKinds';
import { taskRoute } from './taskRoute';

interface TaskRowProps {
  readonly task: TaskStatus;
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

export function TaskRow({ task, onNavigate }: TaskRowProps) {
  const meta = kindMeta(task.kind);
  const route = taskRoute(task);
  const navigable = route !== null;

  const status = task.status;
  const running = status === 'running' || status === 'awaiting_review' || status === 'pending';
  const isDone = status === 'done';
  const isError = status === 'error';
  // A done task whose result carries failed_parts is a partial completion.
  const failedParts = (task.result as { failed_parts?: unknown } | null | undefined)?.failed_parts;
  const isPartial = isDone && Array.isArray(failedParts) && failedParts.length > 0;

  // Dot colour priority: partial → done → error → awaiting_review → kind.
  const dotTone = isPartial
    ? 'warn'
    : isDone
      ? 'ok'
      : isError
        ? 'err'
        : status === 'awaiting_review'
          ? 'warn'
          : 'run';

  const Icon = meta.Icon;
  const title = task.title || task.stage || '處理中';
  const errorText = navigable ? '失敗 · 前往該頁處理' : '失敗';

  return (
    <div
      className={`ss-task-row${navigable ? ' ss-task-row-nav' : ''}`}
      style={kindVars(meta)}
      onClick={navigable ? () => onNavigate(route) : undefined}
    >
      <div className="ss-task-chip">
        <Icon size={15} />
      </div>

      <div className="ss-task-main">
        <div className="ss-task-head">
          <span className="ss-task-title">{title}</span>
          <span className="ss-task-kind">{meta.label}</span>
        </div>

        {running && (
          <>
            <div className="ss-task-progress">
              <div className="ss-task-bar">
                <div
                  className="ss-task-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                />
              </div>
              <span className="ss-task-pct">{task.progress}%</span>
            </div>
            {task.stage && <div className="ss-task-stage">{task.stage}</div>}
          </>
        )}

        {isDone && (
          <div className={`ss-task-note${isPartial ? ' ss-task-note-warn' : ''}`}>
            {isPartial ? '部分完成' : relTime(task.createdAt)}
          </div>
        )}

        {isError && (
          <div className="ss-task-note ss-task-note-err">
            <AlertTriangle size={12} />
            <span>{errorText}</span>
          </div>
        )}
      </div>

      <span className={`ss-task-dot ss-task-dot-${dotTone}${running ? ' ss-task-dot-live' : ''}`} />

      {/* trail slot is always reserved; chevron only drawn when navigable */}
      <span className="ss-task-trail">{navigable && <ChevronRight size={14} />}</span>
    </div>
  );
}
