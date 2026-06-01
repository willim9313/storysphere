import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Edit3, GitBranch, XCircle } from 'lucide-react';
import type { TensionLine } from '@/api/types';

type ReviewStatus = TensionLine['review_status'];

const STATUS_ICONS: Record<ReviewStatus, ReactElement> = {
  approved: <CheckCircle size={11} />,
  modified: <Edit3 size={11} />,
  rejected: <XCircle size={11} />,
  pending: <span style={{ fontSize: 10 }}>·</span>,
};

function renderStatusIcon(status: ReviewStatus) {
  return STATUS_ICONS[status];
}
import { intensityBucket, intensityBarEdge, intensityBarFg, intensityBarFill } from './intensity';

interface Props {
  lines: TensionLine[];
  maxChapter: number;
  hideRejected: boolean;
  focusedId: string | null;
  onFocus: (id: string) => void;
}

export function TensionTrajectoryDashboard({
  lines,
  maxChapter,
  hideRejected,
  focusedId,
  onFocus,
}: Props) {
  const { t } = useTranslation('analysis');
  const visible = hideRejected ? lines.filter((l) => l.review_status !== 'rejected') : lines;

  const density = useMemo(() => {
    const counts = Array(maxChapter + 1).fill(0);
    visible.forEach((l) => {
      (l.teus ?? []).forEach((teu) => {
        counts[teu.chapter] = (counts[teu.chapter] || 0) + 1;
      });
    });
    return counts;
  }, [visible, maxChapter]);
  const densityMax = Math.max(1, ...density);
  const hasDensity = density.some((c) => c > 0);

  const chToPct = (ch: number) => ((ch - 1) / Math.max(maxChapter - 1, 1)) * 100;

  const tickStep = maxChapter > 20 ? 5 : maxChapter > 10 ? 2 : 1;
  const ticks: number[] = [];
  for (let i = 1; i <= maxChapter; i += tickStep) ticks.push(i);
  if (ticks[ticks.length - 1] !== maxChapter) ticks.push(maxChapter);

  return (
    <div className="tn-traj">
      <div className="tn-section-h">
        <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
          <GitBranch size={14} />
        </span>
        <span className="tn-section-h-title">{t('tension.trajectoryTitle')}</span>
        <span className="tn-section-h-sub">
          {t('tension.trajectorySub', { count: visible.length, max: maxChapter })}
        </span>
        <div className="tn-section-h-right">
          <div className="tn-traj-legend">
            <span>{t('tension.intensityLabel')}</span>
            <span className="tn-traj-legend-swatch low">{t('tension.intensityLow')}</span>
            <span className="tn-traj-legend-swatch mid">{t('tension.intensityMid')}</span>
            <span className="tn-traj-legend-swatch high">{t('tension.intensityHigh')}</span>
          </div>
        </div>
      </div>

      <div className="tn-traj-chart">
        {hasDensity && (
          <>
            <div className="tn-traj-density-label-cell">
              <span>{t('tension.density')}</span>
            </div>
            <div className="tn-traj-density">
              {density.map((c, i) => {
                if (i === 0 || c === 0) return null;
                const slotW = 100 / Math.max(maxChapter, 1);
                const w = Math.max(1.2, slotW * 0.9);
                const center = chToPct(i);
                const left = Math.max(0, Math.min(100 - w, center - w / 2));
                return (
                  <div
                    key={i}
                    className="tn-traj-density-bar"
                    style={{
                      left: `${left}%`,
                      width: `${w}%`,
                      height: `${(c / densityMax) * 100}%`,
                    }}
                  />
                );
              })}
            </div>
          </>
        )}

        {visible.map((line) => (
          <TrajectoryRow
            key={line.id}
            line={line}
            maxChapter={maxChapter}
            focused={focusedId === line.id}
            onFocus={() => onFocus(line.id)}
          />
        ))}

        <div className="tn-traj-axis">
          {ticks.map((tick) => (
            <div key={tick} style={{ position: 'absolute', left: `${chToPct(tick)}%` }}>
              <div className="tn-traj-axis-tick-l" />
              <div className="tn-traj-axis-tick">Ch {tick}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrajectoryRow({
  line,
  maxChapter,
  focused,
  onFocus,
}: {
  line: TensionLine;
  maxChapter: number;
  focused: boolean;
  onFocus: () => void;
}) {
  const chToPct = (ch: number) => ((ch - 1) / Math.max(maxChapter - 1, 1)) * 100;
  const ch1 = line.chapter_range[0] ?? 1;
  const ch2 = line.chapter_range[line.chapter_range.length - 1] ?? ch1;
  const x1 = chToPct(ch1);
  const x2 = Math.max(chToPct(ch2), x1 + 2);
  const bucket = intensityBucket(line.intensity_summary);
  const fill = intensityBarFill(bucket);
  const edge = intensityBarEdge(bucket);
  const fg = intensityBarFg(bucket);

  return (
    <div
      className={`tn-traj-row-group tn-traj-row ${
        line.review_status === 'rejected' ? 'is-rejected' : ''
      }`}
    >
      <div
        className={`tn-traj-row-label ${focused ? 'is-focused' : ''}`}
        onClick={onFocus}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onFocus()}
      >
        <div className="tn-traj-row-poles">
          <span>{line.canonical_pole_a}</span>
          <span className="vs">vs</span>
          <span>{line.canonical_pole_b}</span>
        </div>
        <div className="tn-traj-row-meta">
          <div className="tn-traj-row-meta-inner">
            <span>{line.teu_ids.length} TEU</span>
            <span>·</span>
            <span>ch {ch1}–{ch2}</span>
          </div>
          <span className={`tn-traj-status s-${line.review_status}`}>
            {renderStatusIcon(line.review_status)}
          </span>
        </div>
      </div>
      <div
        className="tn-traj-row-canvas"
        onClick={onFocus}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onFocus()}
      >
        <div
          className="tn-traj-row-bar"
          style={{
            left: `${x1}%`,
            width: `${x2 - x1}%`,
            background: fill,
            border: `1px solid ${edge}`,
          }}
        >
          {x2 - x1 > 8 && (
            <span className="tn-traj-row-bar-pct" style={{ color: fg }}>
              {Math.round(line.intensity_summary * 100)}%
            </span>
          )}
        </div>
        {(line.teus ?? []).map((teu) => {
          const x = chToPct(teu.chapter);
          const r = 3 + teu.intensity * 4;
          return (
            <div
              key={teu.id}
              className="tn-traj-row-dot"
              title={`Ch ${teu.chapter} · ${Math.round(teu.intensity * 100)}% · ${teu.tension_description}`}
              style={{
                left: `calc(${x}% - ${r}px)`,
                top: `calc(50% - ${r}px)`,
                width: r * 2,
                height: r * 2,
                border: `1.5px solid ${edge}`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
