import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@/api/types';

export function InterpretationGenerating({ task }: { task: TaskStatus | undefined }) {
  const { t } = useTranslation('analysis');
  const pct = Math.max(0, Math.min(100, task?.progress ?? 0));
  return (
    <section className="sym-gen">
      <div className="sym-gen-head">
        <div className="sym-gen-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <div className="sym-gen-eye">{t('symbol.interpretation.generating')}</div>
          <p className="sym-gen-title">{task?.stage || t('symbol.interpretation.generatingDesc')}</p>
        </div>
        {task?.taskId && (
          <div className="sym-gen-task-id">
            <span style={{ opacity: 0.6, marginRight: 4 }}>task</span>
            {task.taskId.slice(0, 8)}
          </div>
        )}
      </div>
      <div className="sym-gen-progress-bar">
        <div className="sym-gen-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="sym-gen-progress-meta">
        <span>{task?.stage}</span>
        <span className="sym-gen-progress-pct">{pct}%</span>
      </div>
    </section>
  );
}
