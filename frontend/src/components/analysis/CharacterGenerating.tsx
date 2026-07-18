import { Sparkles, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@/api/types';

interface Props {
  task: TaskStatus | undefined;
  name: string;
}

type StageState = 'done' | 'running' | 'pending';

interface Stage {
  key: 'cep' | 'archetype' | 'traits' | 'relations' | 'arc' | 'write';
  state: StageState;
}

/**
 * Derive 6 UI checklist steps from the backend's 3 real progress events.
 *
 * Backend pipeline (backend/storysphere/services/analysis_service.py:306-353,
 * `analyze_character`) emits exactly three progress callbacks:
 *   5  → about to extract the Character Evidence Profile (CEP)
 *   30 → CEP done, starting archetype classification + arc + profile
 *        (these three run concurrently via `gather_parts`)
 *   85 → all three done, starting coverage-metrics computation
 * ...then the task reaches `done` once coverage is computed and the result
 * is persisted.
 *
 * The design splits this into 6 narrative steps for UX clarity, even though
 * steps 2-5 are one concurrent batch behind a single progress event:
 *   1. 彙整 CEP 證據檔        — running until progress reaches 30
 *   2. 原型判定（Jung/Schmidt）— same "running" window as 3-5, 30 → 85
 *   3. 個性特質與行為
 *   4. 關係與關鍵事件
 *   5. 發展弧線
 *   6. 寫入分析結果          — running from 85 until task status is 'done'
 * See InterpretationGenerating.tsx::deriveStages for the sibling pattern on
 * the symbols page this mirrors.
 */
function deriveStages(progress: number, done: boolean): Stage[] {
  const cepDone = progress >= 30;
  const batchDone = progress >= 85;

  const cepState: StageState = cepDone ? 'done' : 'running';
  let batchState: StageState = 'pending';
  if (batchDone) batchState = 'done';
  else if (cepDone) batchState = 'running';
  let writeState: StageState = 'pending';
  if (done) writeState = 'done';
  else if (batchDone) writeState = 'running';

  return [
    { key: 'cep', state: cepState },
    { key: 'archetype', state: batchState },
    { key: 'traits', state: batchState },
    { key: 'relations', state: batchState },
    { key: 'arc', state: batchState },
    { key: 'write', state: writeState },
  ];
}

export function CharacterGenerating({ task, name }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const pct = Math.max(0, Math.min(100, task?.progress ?? 0));
  const stages = deriveStages(pct, task?.status === 'done');
  const taskIdShort = task?.taskId ? task.taskId.slice(0, 8) : '—';

  return (
    <div className="ca-gen">
      <div className="ca-gen-card">
        <div className="ca-gen-head">
          <span className="ca-gen-spin">
            <Sparkles size={16} />
          </span>
          <h2 className="ca-gen-title">{name}</h2>
          <span className="ca-gen-eyebrow">{t('character.generating.label')}</span>
        </div>

        <div className="ca-gen-task">
          {t('character.generating.taskLabel')} · {taskIdShort}
        </div>

        <div className="ca-gen-progress-bar">
          <div className="ca-gen-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <ul className="ca-gen-stages">
          {stages.map((s) => (
            <li key={s.key} className={`ca-gen-stage is-${s.state}`}>
              <span className="ca-gen-stage-bullet">
                {s.state === 'done' && <Check size={11} strokeWidth={3} />}
                {s.state === 'running' && <span className="ca-gen-spinner" />}
                {s.state === 'pending' && <span className="ca-gen-stage-dot" />}
              </span>
              <span className="ca-gen-stage-label">
                {t(`character.generating.stages.${s.key}`)}
              </span>
            </li>
          ))}
        </ul>

        <div className="ca-gen-foot">{t('character.generating.footerNote')}</div>
      </div>
    </div>
  );
}
