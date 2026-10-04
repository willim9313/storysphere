import { AlertTriangle, Check, Minus } from 'lucide-react';

/**
 * The pipeline has five stages, not three.
 *
 * The two human gates between the machine steps are where the actual work
 * happens; they are first-class cells. Machine cells carry a circle marker and
 * gate cells a square one — the shape says "the system does this" vs "you do
 * this" without relying on colour, which collapses to one black in Ink.
 * A not-yet-reachable cell is drawn in the lowered text tone, never dashed.
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
  /** Ran to completion but not everything made it; set alongside `done`. */
  partial?: boolean;
  /** Reachable but not yet satisfiable — lowered text tone. */
  notReady?: boolean;
  progress?: number;
  error?: string | null;
}

interface Props {
  stages: TensionStageSpec[];
}

export function TensionStepperStrip({ stages }: Props) {
  return (
    <div className="tn-stepper">
      {stages.map((s) => (
        <div
          key={s.id}
          className="tn-stage"
          data-kind={s.kind}
          data-done={!!s.done}
          data-running={!!s.running}
          data-failed={!!s.failed}
          data-partial={!!s.partial}
          data-notready={!!s.notReady}
        >
          <div className="tn-stage-top">
            {/* A dash for "some but not all" (indeterminate), a triangle for
                broken: they differ from the tick in shape, not tone. */}
            <span className="tn-stage-mark" data-kind={s.kind} aria-hidden="true">
              {s.partial ? (
                <Minus size={9} />
              ) : s.failed ? (
                <AlertTriangle size={9} />
              ) : s.done ? (
                <Check size={9} />
              ) : null}
            </span>
            <span className="tn-stage-kicker">{s.kicker}</span>
          </div>
          <div className="tn-stage-title">{s.title}</div>
          <div className="tn-stage-note" data-warn={!!s.noteWarning}>
            {s.note}
          </div>

          {s.running && (
            <div className="ss-progress">
              <div className="ss-progress-fill" style={{ width: `${s.progress ?? 0}%` }} />
            </div>
          )}

          {s.error && (
            <div className="tn-stage-error">
              <AlertTriangle size={11} aria-hidden="true" />
              <span>{s.error}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
