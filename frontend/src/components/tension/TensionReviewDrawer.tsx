import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, X } from 'lucide-react';
import { buildDrawerView, type CarrierShare, type PoleView } from './drawerData';
import { formatIntensity, relativeIntensity } from './intensity';
import { formatChapters, type ReviewStatus, type TensionLineDetail } from './reviewTypes';

interface Props {
  line: TensionLineDetail;
  position: { index: number; total: number };
  /** Every TEU's intensity in the book — evidence bars rank per TEU, so they
   *  must not be scaled against the line averages the table uses. */
  teuIntensities: number[];
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveLabels: (poleA: string, poleB: string, note: string) => void;
  onReview: (status: Exclude<ReviewStatus, 'pending'>) => void;
  onClose: () => void;
  onOpenChapter: (chapter: number) => void;
  /** Set by TensionPage so it can move focus in here when the drawer overlays
   *  the content instead of sitting beside it. */
  ref?: React.Ref<HTMLElement>;
}

export function TensionReviewDrawer({
  line,
  position,
  teuIntensities,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveLabels,
  onReview,
  onClose,
  onOpenChapter,
  ref,
}: Props) {
  const { t } = useTranslation('analysis');
  const view = buildDrawerView(line);
  const scale = relativeIntensity(teuIntensities);

  const teus = line.teus ?? [];

  // tabIndex -1 makes the panel itself a focus target: when it overlays the
  // content, focus has to land somewhere inside it, and the panel announces its
  // own aria-label rather than dropping the reader mid-list.
  return (
    <aside ref={ref} tabIndex={-1} className="tn-drawer" aria-label={t('tension.drawer.title')}>
      <header className="tn-drawer-head">
        <div className="tn-drawer-head-top">
          <span className="tn-drawer-pos">
            {t('tension.drawer.position', { index: position.index, total: position.total })}
          </span>
          <button
            type="button"
            className="tn-drawer-close"
            onClick={onClose}
            aria-label={t('tension.drawer.close')}
          >
            <X size={15} />
          </button>
        </div>
        <div className="tn-drawer-poles">
          {line.canonical_pole_a}
          <span className="tn-vs">vs</span>
          {line.canonical_pole_b}
        </div>
        <div className="tn-drawer-meta">
          <span>
            {t('tension.drawer.meta', {
              chapters: formatChapters(line),
              count: view.teuCount,
              intensity: formatIntensity(line.intensity_summary),
            })}
          </span>
          <span className="tn-status-badge" data-s={line.review_status}>
            {t(`tension.status.${line.review_status}`)}
          </span>
        </div>
      </header>

      <div className="tn-drawer-body">
        {view.flippedCount > 0 && (
          <div className="tn-note-warn">
            <b>{t('tension.drawer.flipHead')}</b>
            {t('tension.drawer.flipBody', {
              flipped: view.flippedCount,
              total: view.teuCount,
            })}
          </div>
        )}

        {editing ? (
          /* Keyed by line id so switching rows with J/K remounts the editor and
             re-seeds the drafts. Without that, the previous line's text would
             stay in the fields and a careless save would rewrite the wrong
             line's labels. */
          <LabelEditor
            key={line.id}
            initialA={line.canonical_pole_a}
            initialB={line.canonical_pole_b}
            onCancel={onCancelEdit}
            onSave={onSaveLabels}
          />
        ) : (
          <>
            {line.edit && (
              <div className="tn-note-warn column">
                <span>
                  <b>{t('tension.drawer.editedHead')}</b>
                  {t('tension.drawer.editedOriginal', {
                    a: line.edit.original_pole_a,
                    b: line.edit.original_pole_b,
                  })}
                </span>
                {line.edit.note && (
                  <span>{t('tension.drawer.editedNote', { note: line.edit.note })}</span>
                )}
              </div>
            )}

            <PoleCard label={t('tension.poleA')} name={line.canonical_pole_a} pole={view.poleA} />
            <PoleCard label={t('tension.poleB')} name={line.canonical_pole_b} pole={view.poleB} />
          </>
        )}

        <div className="tn-evidence-head">
          <span className="tn-evidence-title">{t('tension.drawer.evidence')}</span>
          <span className="tn-evidence-count">
            {t('tension.table.evidenceCount', { count: teus.length })}
          </span>
        </div>

        {teus.map((teu) => {
          const band = scale(teu.intensity);
          const quote = (teu.evidence ?? [])[0];
          return (
            <article key={teu.id} className="tn-ev-card">
              <div className="tn-ev-side">
                <span className="tn-ev-ch">{t('tension.drawer.chapter', { n: teu.chapter })}</span>
                <i className="tn-ev-bar">
                  <i className="tn-bar-fill" data-band={band.bucket} style={{ width: '100%' }} />
                </i>
                <span className="tn-ev-pct">{formatIntensity(teu.intensity)}</span>
              </div>
              <div className="tn-ev-main">
                <p className="tn-ev-summary">{teu.tension_description}</p>
                {quote && <blockquote className="tn-ev-quote">{quote}</blockquote>}
                <button
                  type="button"
                  className="tn-link-btn inline"
                  onClick={() => onOpenChapter(teu.chapter)}
                >
                  {t('tension.drawer.backToText', { n: teu.chapter })}
                  <ArrowUpRight size={12} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="tn-drawer-foot">
        <button type="button" className="tn-act-primary grow" onClick={() => onReview('approved')}>
          {t('tension.drawer.approveKey')}
        </button>
        <button
          type="button"
          className={editing ? 'tn-act-primary' : 'tn-act-ghost'}
          onClick={editing ? onCancelEdit : onStartEdit}
        >
          {t('tension.drawer.editKey')}
        </button>
        <button type="button" className="tn-act-ghost" onClick={() => onReview('rejected')}>
          {t('tension.drawer.rejectKey')}
        </button>
      </footer>
    </aside>
  );
}

function PoleCard({ label, name, pole }: { label: string; name: string; pole: PoleView }) {
  const { t } = useTranslation('analysis');
  return (
    <section className="tn-pole-card">
      <div className="tn-pole-label">{label}</div>
      <div className="tn-pole-name">{name}</div>
      {pole.description && <p className="tn-pole-desc">{pole.description}</p>}
      {pole.carriers.length > 0 ? (
        <div className="tn-pole-carriers">
          {pole.carriers.map((c) => (
            <CarrierPill key={c.name} carrier={c} />
          ))}
        </div>
      ) : (
        <span className="tn-pole-carriers-empty">{t('tension.noCarrier')}</span>
      )}
    </section>
  );
}

function CarrierPill({ carrier }: { carrier: CarrierShare }) {
  return (
    <span className="tn-pill" data-t={carrier.entityType ?? 'other'}>
      <span className="tn-pill-dot" />
      {carrier.name}
      <span className="tn-pill-share">
        {carrier.count}/{carrier.total}
      </span>
    </span>
  );
}

function LabelEditor({
  initialA,
  initialB,
  onCancel,
  onSave,
}: {
  initialA: string;
  initialB: string;
  onCancel: () => void;
  onSave: (poleA: string, poleB: string, note: string) => void;
}) {
  const { t } = useTranslation('analysis');
  const [draftA, setDraftA] = useState(initialA);
  const [draftB, setDraftB] = useState(initialB);
  const [draftNote, setDraftNote] = useState('');

  return (
    <div className="tn-editor">
      <div className="tn-editor-title">{t('tension.drawer.editorTitle')}</div>
      <label className="tn-field">
        <span>{t('tension.poleA')}</span>
        <input
          className="tn-input serif"
          value={draftA}
          onChange={(e) => setDraftA(e.target.value)}
        />
      </label>
      <label className="tn-field">
        <span>{t('tension.poleB')}</span>
        <input
          className="tn-input serif"
          value={draftB}
          onChange={(e) => setDraftB(e.target.value)}
        />
      </label>
      <label className="tn-field">
        <span>{t('tension.drawer.noteLabel')}</span>
        <input
          className="tn-input"
          value={draftNote}
          placeholder={t('tension.drawer.notePlaceholder')}
          onChange={(e) => setDraftNote(e.target.value)}
        />
      </label>
      <p className="tn-editor-hint">{t('tension.drawer.editorHint')}</p>
      <div className="tn-editor-actions">
        <button type="button" className="tn-act-ghost" onClick={onCancel}>
          {t('tension.drawer.cancel')}
        </button>
        <button
          type="button"
          className="tn-act-primary"
          onClick={() => onSave(draftA, draftB, draftNote)}
        >
          {t('tension.drawer.saveLabels')}
        </button>
      </div>
    </div>
  );
}
