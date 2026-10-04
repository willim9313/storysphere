import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { buildDrawerView, type CarrierShare } from './drawerData';
import { relativeIntensity } from './intensity';
import { formatChapters, type ReviewStatus, type TensionLineDetail } from './reviewTypes';

const BADGE: Record<ReviewStatus, string> = {
  pending: 'ss-badge-warning',
  approved: 'ss-badge-success',
  modified: 'ss-badge-info',
  rejected: 'ss-badge-error',
};

interface Props {
  line: TensionLineDetail;
  position: { index: number; total: number };
  /** Every line's average intensity — the header's word grade ranks against it. */
  lineIntensities: number[];
  /** Every TEU's intensity in the book — evidence rows rank per TEU, so they
   *  must not be scaled against the line averages. */
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
  lineIntensities,
  teuIntensities,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveLabels,
  onReview,
  onClose,
  onOpenChapter,
  ref,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');
  const view = buildDrawerView(line);
  const teuScale = relativeIntensity(teuIntensities);
  const bandWord = (bucket: string) =>
    t(`tension.table.band${bucket[0].toUpperCase()}${bucket.slice(1)}`);

  const teus = line.teus ?? [];
  const hasCarriers = view.poleA.carriers.length > 0 || view.poleB.carriers.length > 0;

  // tabIndex -1 makes the panel itself a focus target: when it overlays the
  // content, focus has to land somewhere inside it.
  return (
    <aside ref={ref} tabIndex={-1} className="tn-drawer" aria-label={t('tension.drawer.title')}>
      <header className="tn-drawer-head">
        <h3 className="tn-drawer-title">{t('tension.drawer.title')}</h3>
        <span className="tn-spacer" />
        <span className="tn-drawer-pos">
          {t('tension.drawer.position', { index: position.index, total: position.total })}
        </span>
        <button type="button" className="tn-drawer-close" onClick={onClose} aria-label={t('tension.drawer.close')}>
          <X size={14} />
        </button>
      </header>

      <div className="tn-drawer-body">
        <div className="tn-drawer-meta">
          <span className="tn-meta-mono">
            {t('tension.drawer.meta', {
              chapters: formatChapters(line),
              count: view.teuCount,
              intensity: bandWord(relativeIntensity(lineIntensities)(line.intensity_summary).bucket),
            })}
          </span>
          <span className={`ss-badge ${BADGE[line.review_status]}`}>
            {t(`tension.status.${line.review_status}`)}
          </span>
        </div>

        {view.flippedCount > 0 && (
          <div className="tn-note is-warning">
            <strong>{t('tension.drawer.flipHead')}</strong>
            {t('tension.drawer.flipBody', { flipped: view.flippedCount, total: view.teuCount })}
          </div>
        )}

        {editing ? (
          /* Keyed by line id so switching rows with J/K remounts the editor and
             re-seeds the drafts; otherwise a careless save would rewrite the
             wrong line's labels. */
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
              <div className="tn-note is-warning tn-note-col">
                <span>
                  <strong>{t('tension.drawer.editedHead')}</strong>
                  {t('tension.drawer.editedOriginal', {
                    a: line.edit.original_pole_a,
                    b: line.edit.original_pole_b,
                  })}
                </span>
                {line.edit.note && <span>{t('tension.drawer.editedNote', { note: line.edit.note })}</span>}
              </div>
            )}

            <div className="tn-drawer-poles">
              <span className="tn-meta-mono">A</span>
              <span className="tn-drawer-pole">
                {line.canonical_pole_a}
                {view.poleA.description && <small>{view.poleA.description}</small>}
              </span>
              <span className="tn-meta-mono">B</span>
              <span className="tn-drawer-pole">
                {line.canonical_pole_b}
                {view.poleB.description && <small>{view.poleB.description}</small>}
              </span>
              <span className="tn-hint">{t('tension.drawer.carrier')}</span>
              {hasCarriers ? (
                <span className="tn-drawer-carriers">
                  <CarrierGroup label="A" carriers={view.poleA.carriers} />
                  <CarrierGroup label="B" carriers={view.poleB.carriers} />
                </span>
              ) : (
                <span className="tn-hint">{t('tension.noCarrier')}</span>
              )}
            </div>
          </>
        )}

        <div className="tn-evidence">
          <span className="tn-evidence-head">
            {t('tension.drawer.evidence')} · {t('tension.table.evidenceCount', { count: teus.length })}
          </span>
          {/* Text rows: serif quote, hairline between, no hover fill, no edge. */}
          {teus.map((teu) => {
            const quote = (teu.evidence ?? [])[0];
            return (
              <div key={teu.id} className="tn-evidence-row">
                {teu.tension_description && <p className="tn-evidence-desc">{teu.tension_description}</p>}
                {quote && <p className="tn-quote">{quote}</p>}
                <div className="tn-evidence-meta">
                  <span>{t('tension.drawer.chapter', { n: teu.chapter })}</span>
                  <span>{bandWord(teuScale(teu.intensity).bucket)}</span>
                  <button type="button" className="tn-link" onClick={() => onOpenChapter(teu.chapter)}>
                    {t('tension.drawer.backToText', { n: teu.chapter })}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <footer className="tn-drawer-foot">
        <button type="button" className="ss-btn ss-btn-md ss-btn-primary" onClick={() => onReview('approved')}>
          {t('tension.drawer.approveKey')}
        </button>
        <button
          type="button"
          className="ss-btn ss-btn-md ss-btn-secondary"
          aria-pressed={editing}
          onClick={editing ? onCancelEdit : onStartEdit}
        >
          {t('tension.drawer.editKey')}
        </button>
        <button type="button" className="ss-btn ss-btn-md ss-btn-ghost" onClick={() => onReview('rejected')}>
          {t('tension.drawer.rejectKey')}
        </button>
      </footer>
    </aside>
  );
}

function CarrierGroup({ label, carriers }: Readonly<{ label: string; carriers: CarrierShare[] }>) {
  if (carriers.length === 0) return null;
  return (
    <span className="tn-carriers">
      <span className="tn-meta-mono">{label}</span>
      {carriers.map((c) => (
        <span key={c.name} className="tn-pill" data-t={c.entityType ?? 'other'}>
          <span className="tn-pill-dot" />
          {c.name}
          <span className="tn-pill-share">
            {c.count}/{c.total}
          </span>
        </span>
      ))}
    </span>
  );
}

function LabelEditor({
  initialA,
  initialB,
  onCancel,
  onSave,
}: Readonly<{
  initialA: string;
  initialB: string;
  onCancel: () => void;
  onSave: (poleA: string, poleB: string, note: string) => void;
}>) {
  const { t } = useTranslation('analysis');
  const [draftA, setDraftA] = useState(initialA);
  const [draftB, setDraftB] = useState(initialB);
  const [draftNote, setDraftNote] = useState('');

  return (
    <div className="tn-editor">
      <span className="tn-editor-title">{t('tension.drawer.editorTitle')}</span>
      <input
        className="tn-input"
        aria-label={t('tension.poleA')}
        value={draftA}
        onChange={(e) => setDraftA(e.target.value)}
      />
      <input
        className="tn-input"
        aria-label={t('tension.poleB')}
        value={draftB}
        onChange={(e) => setDraftB(e.target.value)}
      />
      <input
        className="tn-input"
        aria-label={t('tension.drawer.noteLabel')}
        value={draftNote}
        placeholder={t('tension.drawer.noteLabel')}
        onChange={(e) => setDraftNote(e.target.value)}
      />
      <p className="tn-editor-hint">{t('tension.drawer.editorHint')}</p>
      <div className="tn-actions-end">
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={onCancel}>
          {t('tension.drawer.cancel')}
        </button>
        <button
          type="button"
          className="ss-btn ss-btn-sm ss-btn-primary"
          onClick={() => onSave(draftA, draftB, draftNote)}
        >
          {t('tension.drawer.saveLabels')}
        </button>
      </div>
    </div>
  );
}
