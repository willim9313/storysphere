import { Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Citation text rendered inline (evidence line / quote body). */
  text: string;
  /** True while this item's #22a passage lookup is in flight. */
  pending: boolean;
  onJump: () => void;
  className?: string;
}

/**
 * #2 evidence/quote "click to jump to the reader passage" affordance —
 * dotted `--entity-char-*` underline + hover fill, per the design canvas's
 * `srcable()` helper (docs/handoff/20260716-character-page/design-return/).
 * Rendered as a `<button>` (not a bare `<span onClick>`) so it's reachable
 * and activatable via keyboard, per the a11y constraint for this batch.
 */
export function SourceJumpText({ text, pending, onJump, className }: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const label = pending ? t('character.sourceJump.locating') : t('character.sourceJump.cta');
  return (
    <button
      type="button"
      className={`ca-srcjump${className ? ` ${className}` : ''}`}
      onClick={onJump}
      disabled={pending}
      title={label}
      aria-label={label}
    >
      {text}
      {pending && (
        <Loader size={11} className="ca-srcjump-spinner animate-spin" aria-hidden="true" />
      )}
    </button>
  );
}
