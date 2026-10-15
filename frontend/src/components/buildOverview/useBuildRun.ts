import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/client';
import { fetchActiveEntityBatch, fetchActiveEventBatch } from '@/api/analysis';
import { fetchRunningUnraveling, type RunningUnraveling } from '@/api/buildOverview';
import { qk } from '@/api/queryKeys';
import { isCancelled } from '@/api/tasks';
import { useAsyncTask } from '@/hooks/useAsyncTask';
import type { TriggerKey } from './buildOverviewModel';

type UnravelingOp = NonNullable<RunningUnraveling['op']>;

/** #19c reports the step name; the page keys triggers by its own names. */
const OP_TO_TRIGGER: Readonly<Record<UnravelingOp, TriggerKey>> = {
  summarization: 'summarization',
  'feature-extraction': 'feature-extraction',
  'knowledge-graph': 'knowledge-graph',
  'symbol-discovery': 'symbol-discovery',
  concepts: 'concept-inference',
};

interface Found {
  key: TriggerKey;
  taskId: string;
}

/**
 * The run of any trigger on this page already going for the book. The reruns
 * and concept inference share one lock (#19c); the character and event batches
 * each have their own (#7j / #7k). A lookup that fails just counts as idle.
 */
async function findRunning(bookId: string): Promise<Found | null> {
  const [own, entity, event] = await Promise.allSettled([
    fetchRunningUnraveling(bookId),
    fetchActiveEntityBatch(bookId),
    fetchActiveEventBatch(bookId),
  ]);
  if (own.status === 'fulfilled' && own.value.op && own.value.taskId) {
    return { key: OP_TO_TRIGGER[own.value.op], taskId: own.value.taskId };
  }
  if (entity.status === 'fulfilled' && entity.value.taskId) {
    return { key: 'entity-batch', taskId: entity.value.taskId };
  }
  if (event.status === 'fulfilled' && event.value.taskId) {
    return { key: 'event-batch', taskId: event.value.taskId };
  }
  return null;
}

/** How a trigger's last run ended badly: the request itself was refused
 *  (`error`, kept raw so the page can tell a missing LLM provider apart), or the
 *  task failed (`message`, the task's own free-text error). */
export interface BuildRunFailure {
  key: TriggerKey;
  error?: unknown;
  message?: string;
}

export interface BuildRun {
  /** The trigger whose run is going, or null. */
  runningKey: TriggerKey | null;
  /** A run is going or a trigger request is in flight: every trigger waits. */
  busy: boolean;
  failure: BuildRunFailure | null;
  start: (key: TriggerKey) => Promise<void>;
}

/**
 * The page's one build run, held above the node inspector.
 *
 * It used to live in the inspector, which is keyed by node: picking another
 * node dropped the run from view and offered the button again, so the same
 * paid run could be started twice. Held here, it survives reselection; it is
 * also looked up on mount and on a 409, so a run started in another tab or
 * before a remount is followed instead of duplicated.
 *
 * At most one at a time from this page, even across separately locked
 * triggers: a knowledge-graph rerun rewrites what the character and event
 * batches read.
 */
export function useBuildRun(
  bookId: string,
  trigger: (key: TriggerKey) => Promise<{ taskId: string }>,
): BuildRun {
  const queryClient = useQueryClient();
  const [key, setKey] = useState<TriggerKey | null>(null);
  const [failure, setFailure] = useState<BuildRunFailure | null>(null);
  const [starting, setStarting] = useState(false);

  // Read inside the task callbacks, which useAsyncTask calls through refs.
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    keyRef.current = key;
  });

  // A rerun can rewrite almost every layer — the graph, the analyses built on
  // it, the timeline, tension, symbols — and each of those pages reads its own
  // cache. The books tree takes most of them; these three roots sit outside it.
  // Also after a failure or a cancel: summarization keeps the chapters it
  // finished, and a batch keeps the items it analysed.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.book(bookId) });
    void queryClient.invalidateQueries({ queryKey: qk.buildOverview.manifest(bookId) });
    void queryClient.invalidateQueries({ queryKey: ['narrative', bookId] });
    void queryClient.invalidateQueries({ queryKey: qk.symbols.overview(bookId) });
  };

  const { taskId, adopt } = useAsyncTask({
    defaultError: '',
    onDone: (_task, ctl) => {
      ctl.reset();
      refresh();
    },
    onError: (message, ctl) => {
      ctl.reset();
      refresh();
      // Cancelling is the user's own choice, not a failed run.
      if (isCancelled({ status: 'error', error: message })) return;
      const k = keyRef.current;
      if (k) setFailure({ key: k, message: message || undefined });
    },
  });

  const taskIdRef = useRef(taskId);
  useLayoutEffect(() => {
    taskIdRef.current = taskId;
  });

  const adoptRunning = useCallback(async (): Promise<boolean> => {
    if (!bookId) return false;
    const found = await findRunning(bookId);
    // Never swap out a run this page already follows.
    if (!found || taskIdRef.current) return false;
    setKey(found.key);
    setFailure(null);
    adopt(found.taskId);
    return true;
  }, [bookId, adopt]);

  useEffect(() => {
    void adoptRunning();
  }, [adoptRunning]);

  const start = useCallback(
    async (k: TriggerKey) => {
      setFailure(null);
      setStarting(true);
      try {
        const { taskId: id } = await trigger(k);
        setKey(k);
        adopt(id);
      } catch (err) {
        // Something else got there first: follow that run instead of
        // reporting a failure.
        const raced = err instanceof ApiError && err.status === 409 && err.code === 'batch_running';
        if (!(raced && (await adoptRunning()))) setFailure({ key: k, error: err });
      } finally {
        setStarting(false);
      }
    },
    [trigger, adopt, adoptRunning],
  );

  const runningKey = taskId ? key : null;
  return { runningKey, busy: starting || runningKey !== null, failure, start };
}
