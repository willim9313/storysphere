import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Edit3, XCircle, Loader2 } from 'lucide-react';
import type { TensionTheme } from '@/api/types';
import { TensionStatusBadge } from './TensionStatusBadge';

interface Props {
  theme: TensionTheme;
  onApprove: () => void;
  onReject: () => void;
  onModify: (proposition: string) => void;
  pending?: boolean;
}

export function TensionThemeHero({
  theme,
  onApprove,
  onReject,
  onModify,
  pending = false,
}: Props) {
  const { t } = useTranslation('analysis');
  const { t: tc } = useTranslation('common');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme.proposition);

  const fryeKey = theme.frye_mythos || '';
  const bookerKey = theme.booker_plot || '';
  const assembledAt = (() => {
    try {
      return new Date(theme.assembled_at).toLocaleDateString('zh-TW');
    } catch {
      return theme.assembled_at;
    }
  })();

  return (
    <div className="tn-hero">
      <div className="tn-hero-eyebrow">
        <span className="tn-hero-eyebrow-dot" />
        {t('tension.heroEyebrow')}
        <span className="tn-hero-status">
          <TensionStatusBadge status={theme.review_status} />
        </span>
      </div>

      {editing ? (
        <textarea
          className="tn-hero-proposition-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
        />
      ) : (
        <p className="tn-hero-proposition">
          {theme.proposition ? `「${theme.proposition}」` : t('tension.noProposition')}
        </p>
      )}

      <div className="tn-hero-meta">
        {fryeKey && (
          <div className="tn-hero-meta-item">
            <div className="tn-hero-meta-label">{t('tension.fryeLabel')}</div>
            <span className="tn-frye-badge" data-mode={fryeKey}>
              <span className="tn-frye-dot" />
              {t(`tension.frye.${fryeKey}`, { defaultValue: fryeKey })}
            </span>
          </div>
        )}
        {bookerKey && (
          <div className="tn-hero-meta-item">
            <div className="tn-hero-meta-label">{t('tension.bookerLabel')}</div>
            <span className="tn-booker-badge">
              <span className="tn-booker-glyph">§</span>
              {t(`tension.booker.${bookerKey}`, { defaultValue: bookerKey })}
            </span>
          </div>
        )}
        <div className="tn-hero-meta-item">
          <div className="tn-hero-meta-label">{t('tension.heroSourceLabel')}</div>
          <div className="tn-hero-meta-value tn-hero-meta-value--secondary">
            {t('tension.heroSource', { count: theme.tension_line_ids.length })}
          </div>
        </div>
      </div>

      <div className="tn-hero-actions">
        {editing ? (
          <>
            <button
              className="tn-btn primary"
              onClick={() => {
                onModify(draft);
                setEditing(false);
              }}
              disabled={pending}
            >
              {pending ? <Loader2 size={12} className="tn-spin" /> : <CheckCircle size={12} />}
              {t('tension.save')}
            </button>
            <button
              className="tn-btn ghost"
              onClick={() => {
                setDraft(theme.proposition);
                setEditing(false);
              }}
            >
              {tc('cancel')}
            </button>
          </>
        ) : (
          <>
            <button
              className="tn-btn success"
              onClick={onApprove}
              disabled={pending || theme.review_status === 'approved'}
            >
              <CheckCircle size={12} /> {t('tension.approve')}
            </button>
            <button
              className="tn-btn info"
              onClick={() => {
                setDraft(theme.proposition);
                setEditing(true);
              }}
              disabled={pending}
            >
              <Edit3 size={12} /> {t('tension.modifyProposition')}
            </button>
            <button
              className="tn-btn danger"
              onClick={onReject}
              disabled={pending || theme.review_status === 'rejected'}
            >
              <XCircle size={12} /> {t('tension.reject')}
            </button>
          </>
        )}
        <div className="tn-hero-actions-meta">
          {theme.assembled_by} · {assembledAt}
        </div>
      </div>
    </div>
  );
}
