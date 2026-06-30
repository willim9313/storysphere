import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, RefreshCw, ExternalLink, AlertCircle, User, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ImageryEntity, Polarity, SymbolInterpretation } from '@/api/symbols';
import { POLARITY_STYLE, POLARITY_VALUES } from './tokens';
import { ReviewBadge } from './Badges';
import { ReviewActions } from './ReviewActions';

interface ResolvedItem {
  id: string;
  name: string;
  hint?: string;
}

interface Props {
  entity: ImageryEntity;
  interpretation: SymbolInterpretation;
  resolvedCharacters: ResolvedItem[];
  resolvedEvents: ResolvedItem[];
  pending: boolean;
  error?: string | null;
  onApprove: () => void;
  onSubmitModify: (theme: string, polarity: Polarity) => void;
  onReject: () => void;
  onRegenerate: () => void;
}

export function InterpretationHero({
  entity,
  interpretation,
  resolvedCharacters,
  resolvedEvents,
  pending,
  error,
  onApprove,
  onSubmitModify,
  onReject,
  onRegenerate,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draftTheme, setDraftTheme] = useState(interpretation.theme);
  const [draftPolarity, setDraftPolarity] = useState<Polarity>(interpretation.polarity);

  const pol = POLARITY_STYLE[interpretation.polarity];
  const PolIcon = pol.icon;
  const assembledDate = interpretation.assembled_at?.slice(0, 10);

  return (
    <section className="sym-hero">
      <div className="sym-hero-meta">
        <span className="sym-hero-tag">
          <Sparkles size={11} /> {t('symbol.interpretation.tag')}
        </span>
        {interpretation.assembled_by && (
          <>
            <span className="sym-hero-sep">·</span>
            <span className="sym-hero-byline">{interpretation.assembled_by}</span>
          </>
        )}
        {assembledDate && (
          <>
            <span className="sym-hero-sep">·</span>
            <span className="sym-hero-byline">{assembledDate}</span>
          </>
        )}
        <span className="sym-hero-meta-spacer" />
        <ReviewBadge status={interpretation.review_status} />
      </div>

      {editing ? (
        <textarea
          className="sym-hero-theme-edit"
          value={draftTheme}
          onChange={(e) => setDraftTheme(e.target.value)}
          placeholder={t('symbol.interpretation.themeEditPlaceholder')}
        />
      ) : (
        <h2 className="sym-hero-theme">{interpretation.theme}</h2>
      )}

      <div className="sym-hero-stats">
        {editing ? (
          <div className="sym-polblock-text">
            <div className="sym-polblock-label">{t('symbol.polarity.label')}</div>
            <div className="sym-polblock-select" style={{ marginTop: 4 }}>
              {POLARITY_VALUES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={'sym-polblock-opt' + (draftPolarity === p ? ' is-active' : '')}
                  onClick={() => setDraftPolarity(p)}
                >
                  {t(`symbol.polarity.${p}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="sym-polblock" style={{ color: pol.fg, background: pol.bg, borderColor: pol.edge }}>
            <div className="sym-polblock-icon">
              <PolIcon size={18} strokeWidth={2.5} />
            </div>
            <div className="sym-polblock-text">
              <div className="sym-polblock-label">{t('symbol.polarity.label')}</div>
              <div className="sym-polblock-value">{t(`symbol.polarity.${interpretation.polarity}`)}</div>
            </div>
          </div>
        )}
        <div className="sym-confblock">
          <div className="sym-confblock-label">{t('symbol.interpretation.confidence')}</div>
          <div className="sym-confblock-bar">
            <div
              className="sym-confblock-fill"
              style={{ width: `${Math.round(interpretation.confidence * 100)}%` }}
            />
          </div>
          <div className="sym-confblock-value">
            <span className="sym-confblock-pct">{Math.round(interpretation.confidence * 100)}%</span>
            <span className="sym-confblock-note">
              {t('symbol.interpretation.confidenceNote', { count: entity.frequency })}
            </span>
          </div>
        </div>
      </div>

      {interpretation.evidence_summary && (
        <div className="sym-hero-evidence">
          <div className="sym-hero-evidence-label">{t('symbol.interpretation.evidence')}</div>
          <p className="sym-hero-evidence-body">{interpretation.evidence_summary}</p>
        </div>
      )}

      <div className="sym-hero-linked">
        <LinkedRow
          label={t('symbol.interpretation.linkedCharacters')}
          icon={<User size={12} />}
          items={resolvedCharacters}
          onNavigate={(id) => navigate(`/books/${entity.book_id}/characters`, { state: { selectId: id } })}
        />
        <LinkedRow
          label={t('symbol.interpretation.linkedEvents')}
          icon={<Flag size={12} />}
          items={resolvedEvents}
          onNavigate={(id) => navigate(`/books/${entity.book_id}/events`, { state: { selectId: id } })}
        />
      </div>

      {error && (
        <div className="sym-hero-error">
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      <div className="sym-hero-actions">
        <span className="sym-hero-actions-label">{t('symbol.review.label')}</span>
        {editing ? (
          <>
            <button
              type="button"
              className="sym-review-btn is-active"
              style={{
                background: 'var(--color-info-bg)',
                color: 'var(--color-info)',
                borderColor: 'var(--color-info)',
              }}
              onClick={() => onSubmitModify(draftTheme, draftPolarity)}
              disabled={pending || !draftTheme.trim()}
            >
              {t('symbol.review.save')}
            </button>
            <button
              type="button"
              className="sym-btn-ghost"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              {t('symbol.review.cancel')}
            </button>
          </>
        ) : (
          <>
            <ReviewActions
              status={interpretation.review_status}
              pending={pending}
              onApprove={onApprove}
              onModify={() => setEditing(true)}
              onReject={onReject}
            />
            <button
              type="button"
              className="sym-btn-ghost"
              onClick={onRegenerate}
              disabled={pending}
              title={t('symbol.interpretation.regenerate')}
            >
              <RefreshCw size={12} /> {t('symbol.interpretation.regenerate')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function LinkedRow({
  label,
  icon,
  items,
  onNavigate,
}: Readonly<{
  label: string;
  icon: React.ReactNode;
  items: ResolvedItem[];
  onNavigate: (id: string) => void;
}>) {
  const { t } = useTranslation('analysis');
  return (
    <div className="sym-linked-row">
      <div className="sym-linked-label">
        {icon}
        <span>{label}</span>
      </div>
      {items.length === 0 ? (
        <div className="sym-linked-empty">{t('symbol.interpretation.linkedEmpty')}</div>
      ) : (
        <div className="sym-linked-items">
          {items.map(({ id, name, hint }) => (
            <button key={id} type="button" className="sym-linked-chip" title={id} onClick={() => onNavigate(id)}>
              <span className="sym-linked-text">{name}</span>
              {hint && <span className="sym-linked-hint">{hint}</span>}
              <ExternalLink size={10} style={{ color: 'var(--fg-muted)' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
