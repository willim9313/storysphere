import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { triggerCharacterAnalysis, pollCharacterAnalysis } from '@/api/analysis';
import { useTaskPolling } from './useTaskPolling';
import type { CharacterAnalysisRequest } from '@/api/types';

export function useCharacterAnalysis() {
  const [taskId, setTaskId] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: (req: CharacterAnalysisRequest) => triggerCharacterAnalysis(req),
    onSuccess: (data) => setTaskId(data.task_id),
  });

  const polling = useTaskPolling({
    queryKey: ['analysis', 'character'],
    taskId,
    pollFn: pollCharacterAnalysis,
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
