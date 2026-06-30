import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  CheckCircle,
  Edit3,
  XCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import type { TensionLine, TEUSummary } from '@/api/types';
import { reviewTensionLine } from '@/api/tension';
import { TensionStatusBadge } from './TensionStatusBadge';

interface Props {
  line: TensionLine;
  bookId: string;
  focused: boolean;
  onFocus: () => void;
  onReviewed: () => void;
  density: 'summary' | 'full';
}

export function TensionLineCard({
  line,
  bookId,
  focused,
  onFocus,
  onReviewed,
  density,
}: Props) {
  const { t } = useTranslation('analysis');
  const { t: tc } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [poleA, setPoleA] = useState(line.canonical_pole_a);
  const [poleB, setPoleB] = useState(line.canonical_pole_b);

  // Only auto-open when `focused` transitions from false to true (an external
  // focus event from the trajectory chart). Without this guard, calling
  // onFocus() from the card-head click would keep `focused === true` while
  // open flips to false, and the effect would force-reopen immediately —
  // making the card uncollapsable.
  const prevFocused = useRef(focused);
  useEffect(() => {
    if (focused && !prevFocused.current) setOpen(true);
    prevFocused.current = focused;
  }, [focused]);

  useEffect(() => {
    setPoleA(line.canonical_pole_a);
    setPoleB(line.canonical_pole_b);
  }, [line.canonical_pole_a, line.canonical_pole_b]);

  const reviewMutation = useMutation({
    mutationFn: ({
      status,
      a,
      b,
    }: {
      status: 'approved' | 'modified' | 'rejected';
      a?: string;
      b?: string;
    }) => reviewTensionLine(line.id, bookId, status, a, b),
    onSuccess: () => {
      setEditing(false);
      onReviewed();
    },
  });

  const teus = line.teus ?? [];
  const ch1 = line.chapter_range[0] ?? 1;
  const ch2 = line.chapter_range[line.chapter_range.length - 1] ?? ch1;

  const carriersA = useMemo(() => unique(teus.flatMap((t_) => t_.pole_a_carriers)), [teus]);
  const carriersB = useMemo(() => unique(teus.flatMap((t_) => t_.pole_b_carriers)), [teus]);

  const visibleTEUs = density === 'summary' && !showAll ? teus.slice(0, 1) : teus;
  const hiddenCount = teus.length - visibleTEUs.length;

  return (
    <div
      id={`tn-line-${line.id}`}
      className={[
        'tn-card',
        open && 'is-open',
        focused && 'is-focused',
        line.review_status === 'rejected' && 'is-rejected',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        className="tn-card-head"
        onClick={() => {
          setOpen((o) => !o);
          onFocus();
        }}
      >
        <span className="tn-card-chev">
          <ChevronRight size={14} />
        </span>
        <span className="tn-card-title">
          <span className="pole">{line.canonical_pole_a}</span>
          <span className="vs">vs</span>
          <span className="pole">{line.canonical_pole_b}</span>
        </span>
        <span className="tn-card-mini-bar" aria-hidden>
          <span
            className="tn-card-mini-bar-fill"
            style={{ width: `${line.intensity_summary * 100}%` }}
          />
        </span>
        <span className="tn-card-meta">
          <span>{line.teu_ids.length} TEU</span>
          <span className="tn-card-meta-sep">·</span>
          <span>ch {ch1}–{ch2}</span>
          <span className="tn-card-meta-sep">·</span>
          <span className="tn-card-meta-pct">{Math.round(line.intensity_summary * 100)}%</span>
        </span>
        <TensionStatusBadge status={line.review_status} />
      </button>

      {open && (
        <div className="tn-card-body">
          {line.thematic_note && <div className="tn-card-note">「{line.thematic_note}」</div>}

          {editing && (
            <div className="tn-edit-row">
              <span className="tn-edit-row-label">POLE A</span>
              <input value={poleA} onChange={(e) => setPoleA(e.target.value)} />
              <span className="tn-edit-row-vs">vs</span>
              <span className="tn-edit-row-label">POLE B</span>
              <input value={poleB} onChange={(e) => setPoleB(e.target.value)} />
              <button
                className="tn-btn primary sm"
                onClick={() =>
                  reviewMutation.mutate({ status: 'modified', a: poleA, b: poleB })
                }
                disabled={reviewMutation.isPending}
              >
                {reviewMutation.isPending ? (
                  <Loader2 size={12} className="tn-spin" />
                ) : (
                  t('tension.save')
                )}
              </button>
              <button
                className="tn-btn ghost sm"
                onClick={() => {
                  setPoleA(line.canonical_pole_a);
                  setPoleB(line.canonical_pole_b);
                  setEditing(false);
                }}
              >
                {tc('cancel')}
              </button>
            </div>
          )}

          <div className="tn-poles">
            <div className="tn-pole">
              <div className="tn-pole-eyebrow">{t('tension.poleA')}</div>
              <div className="tn-pole-name">{line.canonical_pole_a}</div>
              <CarrierPills names={carriersA} />
            </div>
            <div className="tn-pole">
              <div className="tn-pole-eyebrow">{t('tension.poleB')}</div>
              <div className="tn-pole-name">{line.canonical_pole_b}</div>
              <CarrierPills names={carriersB} />
            </div>
          </div>

          {teus.length > 0 && (
            <div className="tn-evidence">
              <div className="tn-evidence-head">
                <span className="tn-evidence-title">{t('tension.evidence')}</span>
                <span className="tn-evidence-count">
                  {t('tension.evidenceCount', { count: teus.length })}
                </span>
                {density === 'summary' && teus.length > 1 && (
                  <button
                    className="tn-evidence-toggle"
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll
                      ? t('tension.showSummary')
                      : t('tension.showAll', { count: teus.length })}
                    {showAll ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                )}
              </div>
              {visibleTEUs.map((teu) => (
                <TEURow key={teu.id} teu={teu} density={density} showAll={showAll} />
              ))}
              {density === 'summary' && !showAll && hiddenCount > 0 && (
                <div className="tn-evidence-hidden">
                  {t('tension.evidenceHidden', { count: hiddenCount })}
                </div>
              )}
            </div>
          )}

          {!editing && (
            <div className="tn-card-actions">
              <button
                className="tn-btn success"
                onClick={() => reviewMutation.mutate({ status: 'approved' })}
                disabled={reviewMutation.isPending || line.review_status === 'approved'}
              >
                <CheckCircle size={12} /> {t('tension.approve')}
              </button>
              <button
                className="tn-btn info"
                onClick={() => setEditing(true)}
                disabled={reviewMutation.isPending}
              >
                <Edit3 size={12} /> {t('tension.modifyLabel')}
              </button>
              <button
                className="tn-btn danger"
                onClick={() => reviewMutation.mutate({ status: 'rejected' })}
                disabled={reviewMutation.isPending || line.review_status === 'rejected'}
              >
                <XCircle size={12} /> {t('tension.reject')}
              </button>
              {reviewMutation.isError && (
                <span className="tn-card-actions-spacer" style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-2xs)' }}>
                  {t('tension.operationFailed')}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function CarrierPills({ names }: { names: string[] }) {
  const { t } = useTranslation('analysis');
  if (!names.length) {
    return <span className="tn-pole-carriers-empty">{t('tension.noCarrier')}</span>;
  }
  // Without per-carrier entity-type info in the response, default to 'character' coloring.
  return (
    <div className="tn-pole-carriers">
      {names.map((n) => (
        <span key={n} className="tn-pill" data-t="character">
          <span className="tn-pill-dot" />
          {n}
        </span>
      ))}
    </div>
  );
}

function TEURow({
  teu,
  density,
  showAll,
}: {
  teu: TEUSummary;
  density: 'summary' | 'full';
  showAll: boolean;
}) {
  const quotes =
    density === 'summary' && !showAll
      ? teu.evidence.slice(0, 1)
      : teu.evidence;
  return (
    <div className="tn-teu">
      <div className="tn-teu-ch">
        <strong>Ch {teu.chapter}</strong>
      </div>
      <div className="tn-teu-intensity">
        <div className="tn-teu-intensity-bar">
          <div className="tn-teu-intensity-fill" style={{ width: `${teu.intensity * 100}%` }} />
        </div>
        <span>{Math.round(teu.intensity * 100)}%</span>
      </div>
      <div className="tn-teu-content">
        <div className="tn-teu-desc">{teu.tension_description}</div>
        {quotes.map((q, i) => (
          <div key={i} className="tn-teu-quote">
            {q}
          </div>
        ))}
      </div>
    </div>
  );
}
