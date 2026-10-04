import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
 * The book-level proposition. When the theme is stale it is replaced by a
 * warning card rather than shown as current: the claim on screen was
 * synthesised from lines that no longer exist.
 *
 * Only 重新合成 spends tokens, so only it carries the glyph; approve / modify /
 * reject are free writes and stay plain text.
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
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme.proposition);

  const assembledAt = formatTimestamp(theme.assembled_at);
  const meta = [theme.assembled_by, assembledAt].filter(Boolean).join(' · ');

  if (theme.is_stale) {
    return (
      <section className="tn-note is-warning tn-alert" role="alert">
        <span className="tn-alert-title">{t('tension.theme.staleTitle')}</span>
        <span className="tn-alert-body">
          {t(`tension.theme.staleReason.${theme.stale_reason ?? 'lines_regrouped'}`)}
        </span>
        <div className="tn-stale-old">{theme.proposition}</div>
        <div className="tn-alert-actions">
          <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm" onClick={onResynthesize}>
            {t('tension.theme.resynthesize')}
          </button>
          {meta && <span className="tn-meta-mono">{meta}</span>}
        </div>
      </section>
    );
  }

  // Counts frozen at synthesis: reviewing since then does not change what this
  // proposition was actually built from. null on themes that predate them.
  const reviewed = theme.reviewed_line_count;
  const total = theme.total_line_count;
  const unreviewedAtSynth = total != null && reviewed != null ? total - reviewed : 0;

  const scale = relativeIntensity(lines.map((l) => l.intensity_summary));
  const supporting = lines
    .filter((l) => (theme.tension_line_ids ?? []).includes(l.id))
    .sort((a, b) => b.intensity_summary - a.intensity_summary)
    .slice(0, 4);

  return (
    <section className="tn-card tn-hero">
      <div className="tn-hero-top">
        <span className="tn-hero-eyebrow">{t('tension.theme.eyebrow')}</span>
        <span className="ss-badge ss-badge-success">{t('tension.theme.fresh')}</span>
        {/* Both chips read just "悲劇" for a tragedy, so a 2xs label says which
            framework each one is. The chip text itself is untouched. */}
        {theme.frye_mythos && (
          <span className="tn-chip-group">
            <span className="tn-chip-label">{t('tension.theme.fryeLabel')}</span>
            <Link
              className="tn-frye-badge"
              data-mode={theme.frye_mythos}
              to="/methodology?framework=frye_mythos"
            >
              <span className="tn-frye-dot" />
              {t(`tension.frye.${theme.frye_mythos}`, { defaultValue: theme.frye_mythos })}
            </Link>
          </span>
        )}
        {theme.booker_plot && (
          <span className="tn-chip-group">
            <span className="tn-chip-label">{t('tension.theme.bookerLabel')}</span>
            <Link className="tn-booker-badge" to="/methodology?framework=booker_plots">
              {t(`tension.booker.${theme.booker_plot}`, { defaultValue: theme.booker_plot })}
            </Link>
          </span>
        )}
      </div>

      {editing ? (
        <div className="tn-hero-editor">
          <textarea
            className="tn-input is-serif"
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="tn-actions-end">
            <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={() => setEditing(false)}>
              {t('tension.theme.cancel')}
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-sm ss-btn-primary"
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

      {/* A quality warning, separate from the provenance line below. */}
      {unreviewedAtSynth > 0 && (
        <div className="tn-note is-warning tn-hero-warn">
          <strong>{t('tension.theme.incompleteHead', { count: unreviewedAtSynth })}</strong>
          <span>{t('tension.theme.incompleteBody')}</span>
        </div>
      )}

      {supporting.length > 0 && (
        <div className="tn-hero-lines">
          <span className="tn-chip-label">{t('tension.theme.supporting')}</span>
          {supporting.map((line) => (
            <button
              key={line.id}
              type="button"
              className="tn-hero-line-pill"
              onClick={() => onOpenLine(line.id)}
            >
              <i data-band={scale(line.intensity_summary).bucket} aria-hidden="true" />
              {line.canonical_pole_a}
              <span className="tn-vs">vs</span>
              {line.canonical_pole_b}
            </button>
          ))}
        </div>
      )}

      <div className="tn-hero-foot">
        <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary ss-btn-llm" onClick={onResynthesize}>
          {t('tension.theme.resynthesizeShort')}
        </button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={onApprove} disabled={pending}>
          {t('tension.approve')}
        </button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={() => setEditing(true)}>
          {t('tension.modifyProposition')}
        </button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={onReject} disabled={pending}>
          {t('tension.reject')}
        </button>
        <span className="tn-spacer" />
        <span className="tn-meta-mono">
          {meta}
          {total != null && reviewed != null
            ? ` · ${t('tension.theme.builtFrom', { reviewed, total })}`
            : ''}
        </span>
      </div>

      {theme.review_status === 'rejected' && (
        <div className="tn-note is-warning">{t('tension.status.rejected')}</div>
      )}
    </section>
  );
}
