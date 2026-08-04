import { AlertTriangle, Check, Sparkles } from 'lucide-react';

/**
 * The pipeline has five stages, not three.
 *
 * The old strip showed only the three machine steps, which taught the page's
 * central lie: that you press 1, 2, 3 and are done. The two human gates between
 * them are where the actual work happens, and leaving them out is how themes
 * ended up synthesised from lines nobody had reviewed. They are drawn here as
 * first-class cells — narrower and chromeless, so they read as checkpoints
 * rather than buttons, but present.
 */
export type StageKind = 'machine' | 'gate';

export interface TensionStageSpec {
  id: 'teu' | 'review-teu' | 'group' | 'review-lines' | 'theme';
  kind: StageKind;
  kicker: string;
  title: string;
  note: string;
  /** Warning-toned note, e.g. "16 個未歸入，待確認". */
  noteWarning?: boolean;
  done?: boolean;
  running?: boolean;
  failed?: boolean;
  /** Reachable but not yet satisfiable — drawn dashed and dimmed. */
  notReady?: boolean;
  /** Everything upstream is finished; the stage offers its action. */
  ready?: boolean;
  progress?: number;
  error?: string | null;
  actionLabel?: string;
  onAction?: () => void;
}

const FLEX: Record<StageKind, number> = { machine: 1.15, gate: 0.95 };

interface Props {
  stages: TensionStageSpec[];
}

export function TensionStepperStrip({ stages }: Props) {
  return (
    <div className="tn-stepper-wrap">
      <div className="tn-stepper">
        {stages.map((s) => (
          <div
            key={s.id}
            className="tn-stage"
            style={{ flex: FLEX[s.kind] }}
            data-kind={s.kind}
            data-done={!!s.done}
            data-running={!!s.running}
            data-failed={!!s.failed}
            data-notready={!!s.notReady}
            data-ready={!!s.ready}
          >
            <div className="tn-stage-top">
              {/* Machine steps get a circle, gates a square: the shape says
                  "the system does this" vs "you do this" without relying on
                  colour, which collapses to one black in the Ink theme. */}
              <span className="tn-stage-dot" data-kind={s.kind}>
                {s.done && <Check size={9} />}
                {s.failed && <AlertTriangle size={9} />}
              </span>
              <span className="tn-stage-kicker">{s.kicker}</span>
            </div>
            <div className="tn-stage-title">{s.title}</div>
            <div className="tn-stage-note" data-warn={!!s.noteWarning}>
              {s.note}
            </div>

            {s.running && (
              <div className="tn-stage-bar">
                <i style={{ width: `${s.progress ?? 0}%` }} />
              </div>
            )}

            {s.actionLabel && s.onAction && (
              <button type="button" className="tn-stage-action" onClick={s.onAction}>
                <Sparkles size={12} />
                {s.actionLabel}
              </button>
            )}

            {s.error && (
              <div className="tn-stage-error">
                <AlertTriangle size={11} />
                <span>{s.error}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
