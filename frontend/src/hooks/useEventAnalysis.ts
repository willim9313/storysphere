import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { triggerEventAnalysis, pollEventAnalysis } from '@/api/analysis';
import { useTaskPolling } from './useTaskPolling';
import type { EventAnalysisRequest } from '@/api/types';

export function useEventAnalysis() {
  const [taskId, setTaskId] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: (req: EventAnalysisRequest) => triggerEventAnalysis(req),
    onSuccess: (data) => setTaskId(data.task_id),
  });

  const polling = useTaskPolling({
    queryKey: ['analysis', 'event'],
    taskId,
    pollFn: pollEventAnalysis,
  });

  const reset = () => {
    setTaskId(null);
    trigger.reset();
  };

  return {
    trigger: trigger.mutate,
    isTriggering: trigger.isPending,
    taskId,
    status: polling.data?.status ?? null,
    result: polling.data?.status === 'completed' ? polling.data.result : null,
    error: polling.data?.error ?? trigger.error?.message ?? null,
    reset,
  };
}
