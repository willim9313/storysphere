import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import type {
  ImageryEntity,
  InterpretationBlockStatus,
  Polarity,
  SymbolInterpretation,
} from '@/api/symbols';
import { POLARITY_STYLE, POLARITY_VALUES } from './tokens';
import { BlockBadge, ReviewBadge } from './Badges';
import { ReviewActions } from './ReviewActions';
import {
  confidenceDots,
  confidenceTier,
  formatAssembledAt,
  revisionEvidence,
  truncateId,
} from './interpretationModel';

interface ResolvedItem {
  id: string;
  name: string;
  hint?: string;
  /** False when the id did not resolve to a name; the id is shown instead, never dropped. */
  resolved: boolean;
}

interface Props {
  entity: ImageryEntity;
  interpretation: SymbolInterpretation;
  /** Set when the last regeneration was refused while this interpretation still stands. */
  block: InterpretationBlockStatus | null;
  /** Front-matter occurrences that went into this interpretation's evidence. */
  frontCount: number;
  resolvedCharacters: ResolvedItem[];
  resolvedEvents: ResolvedItem[];
  pending: boolean;
  error?: string | null;
  onApprove: () => void;
  /** `evidence` is undefined when the draft was left blank (= unchanged). */
  onSubmitModify: (
    theme: string,
    evidence: string | undefined,
    polarity: Polarity,
  ) => Promise<unknown>;
  onReject: () => void;
  /** Opens the regenerate confirmation; also the target of 「再試一次」 under a block. */
  onRegenerate: () => void;
  /** Why regenerating is held (another symbol's run is going), or null. */
  regenerateBlockedReason?: string | null;
}

/**
 * The generated interpretation (DS v3 · 5-4, 11 補稿 A／C).
 *
 * Review is free and writes data only: no glyph, no confirmation. Regenerating
 * spends tokens and overwrites the review state, so it alone is
 * `ss-btn-danger ss-btn-llm` and goes through a confirm dialog on the page. The
 * 12px glyph in the head marks the *content* as LLM-generated, not a button.
 */
export function InterpretationHero({
  entity,
  interpretation,
  block,
  frontCount,
  resolvedCharacters,
  resolvedEvents,
  pending,
  error,
  onApprove,
  onSubmitModify,
  onReject,
  onRegenerate,
  regenerateBlockedReason = null,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const { t: tf } = useTranslation('frameworks');
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const fieldId = useId();
  const themeEditRef = useRef<HTMLTextAreaElement>(null);
  // 「修訂」 opens the form in place; focus follows so keyboard users land in it.
  useEffect(() => {
    if (editing) themeEditRef.current?.focus();
  }, [editing]);
  const [draftTheme, setDraftTheme] = useState(interpretation.theme);
  const [draftEvidence, setDraftEvidence] = useState(interpretation.evidence_summary ?? '');
  const [draftPolarity, setDraftPolarity] = useState<Polarity>(interpretation.polarity);

  const rejected = interpretation.review_status === 'rejected';
  const pol = POLARITY_STYLE[interpretation.polarity];
  const tier = confidenceTier(interpretation.confidence);
  const assembledAt = formatAssembledAt(interpretation.assembled_at);

  const startEdit = () => {
    setDraftTheme(interpretation.theme);
    setDraftEvidence(interpretation.evidence_summary ?? '');
    setDraftPolarity(interpretation.polarity);
    setEditing(true);
  };

  return (
    <section className="sym-interp">
      <div className="sym-interp-head">
        <div className="sym-interp-title">
          <span className="ss-llm-glyph" aria-hidden="true" />
          {/* The tag doubles as the way out to the SEP methodology's full
              description, so the term needs no explaining here. */}
          <Link className="sym-interp-tag" to="/methodology?framework=sep_methodology">
            {t('symbol.interpretation.tag')}
          </Link>
          <ReviewBadge status={interpretation.review_status} />
          {block && <BlockBadge />}
        </div>
        {(interpretation.assembled_by || assembledAt) && (
          <span className="sym-interp-prov">
            {[interpretation.assembled_by, assembledAt].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {block && (
        <div className="sym-interp-block" role="note">
          <div className="sym-interp-block-text">
            <span className="sym-interp-block-title">
              {t('symbol.interpretation.cta.blockedTitle')}
            </span>
            <span className="sym-interp-block-desc">{t('symbol.interpretation.blockedKept')}</span>
            <span className="sym-interp-block-hint">
              {t('symbol.interpretation.cta.blockedHint')}
            </span>
          </div>
          <Tooltip label={regenerateBlockedReason ?? ''} disabled={!regenerateBlockedReason}>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm"
              onClick={onRegenerate}
              disabled={pending || !!regenerateBlockedReason}
            >
              {t('symbol.interpretation.cta.blockedButton')}
            </button>
          </Tooltip>
        </div>
      )}

      {rejected && (
        <div className="sym-interp-rejected" role="note">
          <strong>{t('symbol.review.rejected')}</strong>
          <span>{t('symbol.interpretation.rejectedNote')}</span>
        </div>
      )}

      <div className={'sym-interp-body' + (rejected && !editing ? ' is-rejected' : '')}>
        <div className="sym-interp-field">
          <span className="sym-interp-label" id={`${fieldId}-theme`}>
            {t('symbol.interpretation.field.theme')}
          </span>
          {editing ? (
            <textarea
              ref={themeEditRef}
              aria-labelledby={`${fieldId}-theme`}
              className="sym-interp-edit is-theme"
              rows={3}
              value={draftTheme}
              onChange={(e) => setDraftTheme(e.target.value)}
              placeholder={t('symbol.interpretation.themeEditPlaceholder')}
            />
          ) : (
            <p className="sym-interp-theme">{interpretation.theme}</p>
          )}
        </div>

        <div className="sym-interp-row">
          <div className="sym-interp-field">
            <span className="sym-interp-label" id={`${fieldId}-polarity`}>
              {t('symbol.interpretation.field.polarity')}
            </span>
            {editing ? (
              <div
                className="sym-interp-polsel"
                role="group"
                aria-labelledby={`${fieldId}-polarity`}
              >
                {POLARITY_VALUES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={'sym-interp-polopt' + (draftPolarity === p ? ' is-selected' : '')}
                    aria-pressed={draftPolarity === p}
                    onClick={() => setDraftPolarity(p)}
                  >
                    {t(`symbol.polarity.${p}`)}
                  </button>
                ))}
              </div>
            ) : (
              <span
                className="sym-interp-pol"
                style={{ background: pol.bg, color: pol.fg, borderColor: pol.edge }}
              >
                <span className="sym-interp-pol-dot" style={{ background: pol.dot }} />
                {t(`symbol.polarity.${interpretation.polarity}`)}
              </span>
            )}
          </div>
          <div className="sym-interp-field">
            <span className="sym-interp-label">{t('symbol.interpretation.field.confidence')}</span>
            {/* Three tiers as in the methodology page's TierLegend (07): dots
                carry the tier without hue, then name, score, fixed range. */}
            <div className="sym-interp-conf">
              <span className="sym-interp-conf-dots" aria-hidden="true">
                {confidenceDots(tier)}
              </span>
              <span className="sym-interp-conf-name">{tf(`tier.${tier}`)}</span>
              <span className="sym-interp-conf-num">{interpretation.confidence.toFixed(2)}</span>
              <span className="sym-interp-conf-range">（{tf(`tier.${tier}Range`)}）</span>
            </div>
          </div>
        </div>

        {(editing || interpretation.evidence_summary) && (
          <div className="sym-interp-field">
            <span className="sym-interp-label" id={`${fieldId}-evidence`}>
              {t('symbol.interpretation.field.evidence')}
            </span>
            {editing ? (
              <textarea
                aria-labelledby={`${fieldId}-evidence`}
                className="sym-interp-edit is-evidence"
                rows={4}
                value={draftEvidence}
                onChange={(e) => setDraftEvidence(e.target.value)}
              />
            ) : (
              <p className="sym-interp-evidence">{interpretation.evidence_summary}</p>
            )}
          </div>
        )}

        <div className="sym-interp-links">
          <div className="sym-interp-field">
            <span className="sym-interp-label">
              {t('symbol.interpretation.linkedCharactersN', { count: resolvedCharacters.length })}
            </span>
            {resolvedCharacters.length === 0 ? (
              <span className="sym-interp-empty">{t('symbol.interpretation.linkedEmpty')}</span>
            ) : (
              <div className="sym-interp-chips">
                {resolvedCharacters.map(({ id, name, hint, resolved }) =>
                  resolved ? (
                    <Tooltip key={id} label={hint ?? id}>
                      <button
                        type="button"
                        className="ss-pill ss-pill-character sym-interp-pill"
                        onClick={() =>
                          navigate(`/books/${entity.book_id}/characters`, { state: { selectId: id } })
                        }
                      >
                        <span className="ss-pill-dot" />
                        {name}
                      </button>
                    </Tooltip>
                  ) : (
                    <UnresolvedId key={id} id={id} />
                  ),
                )}
              </div>
            )}
          </div>
          <div className="sym-interp-field">
            <span className="sym-interp-label">
              {t('symbol.interpretation.linkedEventsN', { count: resolvedEvents.length })}
            </span>
            {resolvedEvents.length === 0 ? (
              <span className="sym-interp-empty">{t('symbol.interpretation.linkedEmpty')}</span>
            ) : (
              <div className="sym-interp-events">
                {resolvedEvents.map(({ id, name, hint, resolved }) =>
                  resolved ? (
                    <button
                      key={id}
                      type="button"
                      className="sym-interp-event"
                      onClick={() =>
                        navigate(`/books/${entity.book_id}/events`, { state: { selectId: id } })
                      }
                    >
                      {hint && <span className="sym-interp-event-ch">{hint}</span>}
                      {name}
                    </button>
                  ) : (
                    <UnresolvedId key={id} id={id} />
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="sym-hero-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </div>
      )}

      {frontCount > 0 && (
        /*
         * States what went in, not what a regeneration would leave out.
         *
         * The design promised 「重新生成時將排除前置頁」. It does not: `assemble_sep`
         * collects every occurrence with no segment filter, and the prompt takes
         * the first 20 ordered by chapter — so front matter is the *first*
         * evidence the model sees. Printing the promise would make this card lie
         * about the thing it exists to disclose. Recorded as B-074.
         */
        <p className="sym-hero-warn">
          <AlertCircle size={12} aria-hidden="true" />
          {t('symbol.interpretation.frontMatterWarning', { count: frontCount })}
        </p>
      )}

      <div className="sym-interp-foot">
        {editing ? (
          <div className="sym-interp-actions">
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-primary"
              onClick={() => {
                // The editor stays open if the save fails, so the draft is not lost.
                onSubmitModify(draftTheme, revisionEvidence(draftEvidence), draftPolarity).then(
                  () => setEditing(false),
                  () => undefined,
                );
              }}
              disabled={pending || !draftTheme.trim()}
            >
              {t('symbol.interpretation.saveEdit')}
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-ghost"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              {t('symbol.review.cancel')}
            </button>
            <span className="sym-interp-cost">{t('symbol.interpretation.editZeroCost')}</span>
          </div>
        ) : (
          <ReviewActions
            status={interpretation.review_status}
            pending={pending}
            onApprove={onApprove}
            onModify={startEdit}
            onReject={onReject}
          />
        )}
        <div className="sym-interp-actions">
          <span className="sym-interp-cost">{t('tension.state.tokenHintShort')}</span>
          <Tooltip label={regenerateBlockedReason ?? ''} disabled={!regenerateBlockedReason}>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-danger ss-btn-llm"
              onClick={onRegenerate}
              disabled={pending || editing || !!regenerateBlockedReason}
            >
              {t('symbol.interpretation.regenerate')}
            </button>
          </Tooltip>
        </div>
      </div>
    </section>
  );
}

/** A linked id that did not resolve: shortened, mono, dashed — kept rather than dropped. */
function UnresolvedId({ id }: Readonly<{ id: string }>) {
  return (
    <Tooltip label={id}>
      <span className="sym-interp-unresolved">{truncateId(id)}</span>
    </Tooltip>
  );
}
