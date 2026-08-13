import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle, Edit3, Loader2, Sparkles, XCircle } from 'lucide-react';
import type { components } from '@/api/generated';
import { relativeIntensity } from './intensity';
import type { TensionLineDetail } from './reviewTypes';

type TensionTheme = components['schemas']['TensionThemeResponse'];

function formatTimestamp(iso: string): string | null {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return null;
  }
}

interface Props {
  theme: TensionTheme;
  lines: TensionLineDetail[];
  onResynthesize: () => void;
  onOpenLine: (lineId: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onModify: (proposition: string) => void;
  pending?: boolean;
}

/**
 * The book-level proposition — the largest type on the page, deliberately.
 *
 * When the theme is stale it is replaced by a warning card rather than shown as
 * current: the proposition on screen was synthesised from lines that no longer
 * exist, and rendering it normally would present a stale claim as fact.
 */
export function TensionThemeHero({
  theme,
  lines,
  onResynthesize,
  onOpenLine,
  onApprove,
  onReject,
  onModify,
  pending = false,
}: Props) {
  const { t } = useTranslation('analysis');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme.proposition);

  const assembledAt = formatTimestamp(theme.assembled_at);
  const meta = [theme.assembled_by, assembledAt].filter(Boolean).join(' · ');

  if (theme.is_stale) {
    return (
      <section className="tn-stale-card">
        <div className="tn-stale-head">
          <span className="tn-stale-mark" aria-hidden="true">
            !
          </span>
          <span>{t('tension.theme.staleTitle')}</span>
        </div>
        <p className="tn-stale-body">
          {t(`tension.theme.staleReason.${theme.stale_reason ?? 'lines_regrouped'}`)}
        </p>
        <div className="tn-stale-old">{theme.proposition}</div>
        <div className="tn-state-actions">
          <button type="button" className="tn-state-cta sm" onClick={onResynthesize}>
            <Sparkles size={13} />
            {t('tension.theme.resynthesize')}
          </button>
          {meta && <span className="tn-state-meta">{meta}</span>}
        </div>
      </section>
    );
  }

  // Counts frozen at synthesis: reviewing since then does not change what this
  // proposition was actually built from.
  const reviewed = theme.reviewed_line_count;
  const total = theme.total_line_count;
  const unreviewedAtSynth = total != null && reviewed != null ? total - reviewed : 0;

  const scale = relativeIntensity(lines.map((l) => l.intensity_summary));
  const supporting = lines
    .filter((l) => (theme.tension_line_ids ?? []).includes(l.id))
    .sort((a, b) => b.intensity_summary - a.intensity_summary)
    .slice(0, 4);

  return (
    <section className="tn-hero">
      <div className="tn-hero-top">
        <span className="tn-hero-eyebrow">{t('tension.theme.eyebrow')}</span>
        <span className="tn-hero-badge">{t('tension.theme.fresh')}</span>
        {/* Not in the design canvas — kept per the cross-check decision to
            retain the Frye / Booker classification. Badge doubles as the way
            out to its full description, so the term needs no explaining here. */}
        {theme.frye_mythos && (
          <Link className="tn-frye-badge" data-mode={theme.frye_mythos} to="/methodology?framework=frye_mythos">
            <span className="tn-frye-dot" />
            {t(`tension.frye.${theme.frye_mythos}`, { defaultValue: theme.frye_mythos })}
          </Link>
        )}
        {theme.booker_plot && (
          <Link className="tn-booker-badge" to="/methodology?framework=booker_plots">
            {t(`tension.booker.${theme.booker_plot}`, { defaultValue: theme.booker_plot })}
          </Link>
        )}
      </div>

      {editing ? (
        <div className="tn-hero-editor">
          <textarea
            className="tn-input serif"
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="tn-editor-actions">
            <button type="button" className="tn-act-ghost" onClick={() => setEditing(false)}>
              {t('tension.theme.cancel')}
            </button>
            <button
              type="button"
              className="tn-act-primary"
              onClick={() => {
                onModify(draft);
                setEditing(false);
              }}
            >
              {t('tension.saveModify')}
            </button>
          </div>
        </div>
      ) : (
        <p className="tn-hero-proposition">{theme.proposition}</p>
      )}

      {unreviewedAtSynth > 0 && (
        <div className="tn-hero-warn">
          <b>{t('tension.theme.incompleteHead', { count: unreviewedAtSynth })}</b>
          {t('tension.theme.incompleteBody')}
        </div>
      )}

      {supporting.length > 0 && (
        <div className="tn-hero-lines">
          <span className="tn-hero-lines-label">{t('tension.theme.supporting')}</span>
          {supporting.map((line) => (
            <button
              key={line.id}
              type="button"
              className="tn-hero-line-pill"
              onClick={() => onOpenLine(line.id)}
            >
              <i data-band={scale(line.intensity_summary).bucket} />
              {line.canonical_pole_a}
              <span className="tn-vs">vs</span>
              {line.canonical_pole_b}
            </button>
          ))}
        </div>
      )}

      <div className="tn-hero-foot">
        <button type="button" className="tn-act-ghost" onClick={onResynthesize}>
          <Sparkles size={12} />
          {t('tension.theme.resynthesizeShort')}
        </button>
        {/* Theme review is absent from the design canvas; kept because #14j
            works and dropping a functioning control needs its own decision. */}
        <button type="button" className="tn-act-ghost" onClick={onApprove} disabled={pending}>
          {pending ? <Loader2 size={12} className="tn-spin" /> : <CheckCircle size={12} />}
          {t('tension.approve')}
        </button>
        <button type="button" className="tn-act-ghost" onClick={() => setEditing(true)}>
          <Edit3 size={12} />
          {t('tension.modifyProposition')}
        </button>
        <button type="button" className="tn-act-ghost" onClick={onReject} disabled={pending}>
          <XCircle size={12} />
          {t('tension.reject')}
        </button>
        <span className="tn-toolbar-spacer" />
        <span className="tn-state-meta">
          {meta}
          {total != null && reviewed != null
            ? ` · ${t('tension.theme.builtFrom', { reviewed, total })}`
            : ''}
        </span>
      </div>

      {theme.review_status === 'rejected' && (
        <div className="tn-hero-warn">
          <AlertTriangle size={12} />
          {t('tension.status.rejected')}
        </div>
      )}
    </section>
  );
}
