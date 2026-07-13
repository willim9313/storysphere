import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchTasks, type TaskStatus } from '@/api/tasks';
import { useToast, type PushToastInput } from '@/contexts/ToastContext';

/** Strip the trailing " 解析" the backend appends to ingestion task titles so
 *  the toast shows the bare book title. */
function bookTitleOf(task: TaskStatus): string {
  const raw = (task.title ?? '').trim();
  return raw.replace(/\s*解析$/, '') || raw || '書籍';
}

function bookIdOf(task: TaskStatus): string | undefined {
  const id = (task.result as { bookId?: unknown } | null | undefined)?.bookId;
  return typeof id === 'string' && id ? id : undefined;
}

function failedStepsOf(task: TaskStatus): string[] {
  const fs = (task.result as { failedSteps?: unknown } | null | undefined)?.failedSteps;
  return Array.isArray(fs) ? (fs as string[]) : [];
}

/** A terminal/actionable phase we surface as a toast. `done` splits into
 *  success vs partial by whether any pipeline step failed. */
type Phase = 'done' | 'partial' | 'awaiting_review' | 'error';

function phaseOf(task: TaskStatus): Phase | null {
  if (task.status === 'error') return 'error';
  if (task.status === 'awaiting_review') return 'awaiting_review';
  if (task.status === 'done') return failedStepsOf(task).length > 0 ? 'partial' : 'done';
  return null;
}

/**
 * App-level watcher: polls the task list on every page and fires a global toast
 * when an ingestion task reaches an actionable phase (done / partial /
 * awaiting_review / error). Shares the `['tasks', 'list']` query cache with the
 * Task Center, so this adds no extra network beyond the poll interval.
 *
 * The first poll after mount seeds the last-seen phases silently — tasks that
 * were already terminal before the app loaded do not fire toasts.
 */
export function useTaskNotifications() {
  const navigate = useNavigate();
  const { t } = useTranslation('upload');
  const { push } = useToast();

  const { data } = useQuery<TaskStatus[]>({
    queryKey: ['tasks', 'list'],
    queryFn: () => fetchTasks(),
    // Only poll while some task is still in flight; when everything is terminal
    // (done/error) the app is idle and polling stops so we don't hammer /tasks
    // forever. A new ingestion re-wakes this via invalidateQueries on upload.
    refetchInterval: (query) => {
      const tasks = query.state.data;
      const hasActive = tasks?.some((t) => t.status !== 'done' && t.status !== 'error');
      return hasActive ? 4000 : false;
    },
  });

  const lastPhaseRef = useRef<Map<string, Phase>>(new Map());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    const seen = lastPhaseRef.current;

    for (const task of data) {
      if (task.kind !== 'ingestion') continue;
      const phase = phaseOf(task);
      if (phase === null) continue;
      const prev = seen.get(task.taskId);
      seen.set(task.taskId, phase);
      if (!seededRef.current || prev === phase) continue;

      const title = bookTitleOf(task);
      const bookId = bookIdOf(task);
      const toast = buildToast(phase, title, bookId, task.error, t, navigate);
      if (toast) push({ ...toast, dedupeKey: `${task.taskId}:${phase}` });
    }
    seededRef.current = true;
  }, [data, push, navigate, t]);
}

type Navigate = ReturnType<typeof useNavigate>;
type TFunc = ReturnType<typeof useTranslation>['t'];

function buildToast(
  phase: Phase,
  title: string,
  bookId: string | undefined,
  error: string | undefined,
  t: TFunc,
  navigate: Navigate,
): PushToastInput | null {
  const bookAction = bookId
    ? { label: t('notify.gotoBook'), onClick: () => navigate(`/books/${bookId}`) }
    : undefined;

  switch (phase) {
    case 'done':
      return {
        type: 'success',
        title: t('notify.doneTitle', { title }),
        body: t('notify.doneBody'),
        action: bookAction,
      };
    case 'partial':
      return {
        type: 'warning',
        title: t('notify.partialTitle', { title }),
        body: t('notify.partialBody'),
        action: bookId
          ? { label: t('notify.gotoLibrary'), onClick: () => navigate(`/books/${bookId}`) }
          : undefined,
      };
    case 'awaiting_review':
      return {
        type: 'warning',
        title: t('notify.reviewTitle', { title }),
        body: t('notify.reviewBody'),
        action: bookId
          ? { label: t('notify.gotoReview'), onClick: () => navigate(`/upload/review/${bookId}`) }
          : undefined,
      };
    case 'error':
      return {
        type: 'error',
        title: t('notify.errorTitle', { title }),
        body: error || undefined,
        action: { label: t('notify.gotoUpload'), onClick: () => navigate('/upload') },
      };
    default:
      return null;
  }
}
