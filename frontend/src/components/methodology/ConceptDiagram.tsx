import { useTranslation } from 'react-i18next';
import type { Framework } from '@/data/frameworksData';

type Tint = { bg: string; fg: string; edge: string; dot: string };

const TINT: Record<'green' | 'amber' | 'blue' | 'red' | 'violet', Tint> = {
  green: { bg: 'var(--entity-loc-bg)', fg: 'var(--entity-loc-fg)', edge: 'var(--entity-loc-border)', dot: 'var(--entity-loc-dot)' },
  amber: { bg: 'var(--entity-org-bg)', fg: 'var(--entity-org-fg)', edge: 'var(--entity-org-border)', dot: 'var(--entity-org-dot)' },
  blue: { bg: 'var(--entity-char-bg)', fg: 'var(--entity-char-fg)', edge: 'var(--entity-char-border)', dot: 'var(--entity-char-dot)' },
  red: { bg: 'var(--entity-evt-bg)', fg: 'var(--entity-evt-fg)', edge: 'var(--entity-evt-border)', dot: 'var(--entity-evt-dot)' },
  violet: { bg: 'var(--entity-con-bg)', fg: 'var(--entity-con-fg)', edge: 'var(--entity-con-border)', dot: 'var(--entity-con-dot)' },
};

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function wedge(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${cx},${cy} L${p0.x},${p0.y} A${r},${r} 0 ${large} 1 ${p1.x},${p1.y} Z`;
}

function ConceptFrame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="md-concept">
      <div className="md-concept-stage">{children}</div>
      {caption && <div className="md-concept-cap">{caption}</div>}
    </div>
  );
}

// ── Jung archetype wheel ────────────────────────────────────────────
function JungWheel({ fw }: { fw: Framework }) {
  const { t } = useTranslation('frameworks');
  const nameOf = (id: string) => fw.items.find((x) => x.id === id)?.name ?? id;
  const groups = [
    { tint: TINT.red, label: t('concept.jungChange'), ids: ['hero', 'rebel', 'magician'] },
    { tint: TINT.amber, label: t('concept.jungOrder'), ids: ['caregiver', 'creator', 'ruler'] },
    { tint: TINT.blue, label: t('concept.jungBelonging'), ids: ['jester', 'lover', 'orphan'] },
    { tint: TINT.green, label: t('concept.jungIndep'), ids: ['innocent', 'sage', 'explorer'] },
  ];
  const cx = 230;
  const cy = 195;
  const R = 132;
  const dotR = 132;
  const labR = 168;
  return (
    <ConceptFrame caption={t('concept.jungCaption')}>
      <svg viewBox="0 0 460 410" className="md-svg" style={{ maxWidth: 460 }}>
        {groups.map((g, gi) => {
          const a0 = gi * 90;
          const a1 = a0 + 90;
          return <path key={gi} d={wedge(cx, cy, R, a0, a1)} fill={g.tint.bg} stroke="var(--bg-primary)" strokeWidth="2" />;
        })}
        <circle cx={cx} cy={cy} r="58" fill="var(--bg-primary)" stroke="var(--border)" />
        <text x={cx} y={cy - 6} textAnchor="middle" className="md-svg-center">{t('concept.jungCenter')}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="md-svg-centersub">{t('concept.jungCenterSub')}</text>
        {groups.map((g, gi) =>
          g.ids.map((id, di) => {
            const ang = gi * 90 + 15 + di * 30;
            const p = polar(cx, cy, dotR, ang);
            const lp = polar(cx, cy, labR, ang);
            const anchor = Math.abs(lp.x - cx) < 12 ? 'middle' : lp.x < cx ? 'end' : 'start';
            return (
              <g key={id}>
                <circle cx={p.x} cy={p.y} r="6" fill={g.tint.dot} stroke="var(--bg-primary)" strokeWidth="1.5" />
                <text x={lp.x} y={lp.y + 4} textAnchor={anchor} className="md-svg-label" style={{ fill: 'var(--fg-secondary)' }}>
                  {nameOf(id)}
                </text>
              </g>
            );
          }),
        )}
      </svg>
      <div className="md-concept-legend">
        {groups.map((g, i) => (
          <div className="md-legchip" key={i}>
            <span className="sw" style={{ background: g.tint.dot }} />
            {g.label}
          </div>
        ))}
      </div>
    </ConceptFrame>
  );
}

// ── Frye four-season cycle ─────────────────────────────────────────
function FryeSeasons() {
  const { t } = useTranslation('frameworks');
  const cx = 200;
  const cy = 195;
  const R = 150;
  const seasons = [
    { tint: TINT.green, season: t('concept.fryeSpring'), mythos: t('concept.fryeComedy'), reg: t('concept.fryeComedyReg') },
    { tint: TINT.amber, season: t('concept.fryeSummer'), mythos: t('concept.fryeRomance'), reg: t('concept.fryeRomanceReg') },
    { tint: TINT.red, season: t('concept.fryeAutumn'), mythos: t('concept.fryeTragedy'), reg: t('concept.fryeTragedyReg') },
    { tint: TINT.violet, season: t('concept.fryeWinter'), mythos: t('concept.fryeIrony'), reg: t('concept.fryeIronyReg') },
  ];
  return (
    <ConceptFrame caption={t('concept.fryeCaption')}>
      <svg viewBox="0 0 400 410" className="md-svg" style={{ maxWidth: 400 }}>
        <defs>
          <marker id="frye-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M1,1 L6,4 L1,7" fill="none" stroke="var(--fg-muted)" strokeWidth="1.4" />
          </marker>
        </defs>
        {seasons.map((s, i) => {
          const a0 = i * 90;
          const a1 = a0 + 90;
          const mid = polar(cx, cy, R * 0.66, a0 + 45);
          return (
            <g key={i}>
              <path d={wedge(cx, cy, R, a0, a1)} fill={s.tint.bg} stroke="var(--bg-primary)" strokeWidth="2.5" />
              <text x={mid.x} y={mid.y - 12} textAnchor="middle" className="md-svg-season" style={{ fill: s.tint.fg }}>{s.season}</text>
              <text x={mid.x} y={mid.y + 7} textAnchor="middle" className="md-svg-mythos" style={{ fill: s.tint.fg }}>{s.mythos}</text>
              <text x={mid.x} y={mid.y + 23} textAnchor="middle" className="md-svg-reg" style={{ fill: s.tint.fg }}>{s.reg}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="40" fill="var(--bg-primary)" stroke="var(--border)" />
        <text x={cx} y={cy - 3} textAnchor="middle" className="md-svg-centersub">{t('concept.fryeCenter')}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" className="md-svg-centersub">{t('concept.fryeCenterSub')}</text>
      </svg>
    </ConceptFrame>
  );
}

// ── Hero's Journey ─────────────────────────────────────────────────
function HeroJourney() {
  const { t } = useTranslation('frameworks');
  const cx = 200;
  const cy = 190;
  const R = 150;
  const labels = (t('concept.hjStageList') as string).split('|');
  const stages = Array.from({ length: 12 }, (_, i) => ({
    n: i + 1,
    label: labels[i] ?? '',
    act: i < 5 ? 0 : i < 9 ? 1 : 2,
  }));
  const actTints = [TINT.green, TINT.red, TINT.amber];
  const acts = [
    { t: TINT.green, label: t('concept.hjDeparture'), range: '1–5' },
    { t: TINT.red, label: t('concept.hjInitiation'), range: '6–9' },
    { t: TINT.amber, label: t('concept.hjReturn'), range: '10–12' },
  ];
  return (
    <ConceptFrame caption={t('concept.hjCaption')}>
      <svg viewBox="0 0 400 400" className="md-svg" style={{ maxWidth: 380 }}>
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy} Z`} fill="var(--bg-secondary)" />
        <path d={`M ${cx + R} ${cy} A ${R} ${R} 0 0 1 ${cx - R} ${cy} Z`} fill="var(--bg-tertiary)" />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" />
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="var(--border)" strokeDasharray="3 3" />
        <text x={cx} y={cy - R + 22} textAnchor="middle" className="md-svg-world">{t('concept.hjOrdinary')}</text>
        <text x={cx} y={cy + R - 12} textAnchor="middle" className="md-svg-world">{t('concept.hjSpecial')}</text>
        {stages.map((s, i) => {
          const ang = (i / 12) * 360 + 15;
          const p = polar(cx, cy, R, ang);
          return (
            <g key={s.n}>
              <circle cx={p.x} cy={p.y} r="13" fill={actTints[s.act].dot} stroke="var(--bg-primary)" strokeWidth="2" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" className="md-svg-num" style={{ fill: 'var(--bg-primary)' }}>{s.n}</text>
            </g>
          );
        })}
      </svg>
      <div className="md-hj-legend">
        {acts.map((a, ai) => (
          <div className="md-hj-act" key={ai}>
            <div className="md-hj-acthead">
              <span className="sw" style={{ background: a.t.dot }} />
              {a.label}
              <span className="rg">{a.range}</span>
            </div>
            <div className="md-hj-stages">
              {stages
                .filter((s) => s.act === ai)
                .map((s) => (
                  <span key={s.n} className="md-hj-stage">
                    <b>{s.n}</b> {s.label}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
    </ConceptFrame>
  );
}

// ── Booker — seven shapes of story ──────────────────────────────────
function BookerShapes({ fw }: { fw: Framework }) {
  const { t } = useTranslation('frameworks');
  const shapes: Record<string, string> = {
    overcoming_the_monster: '2,28 30,30 60,12 90,30 118,6',
    rags_to_riches: '2,34 35,16 62,30 92,14 118,4',
    the_quest: '2,30 28,20 52,28 78,14 102,22 118,6',
    voyage_and_return: '2,16 32,34 64,36 96,22 118,12',
    comedy_booker: '2,24 24,12 48,30 72,14 96,28 118,8',
    tragedy_booker: '2,30 36,10 64,8 92,24 118,38',
    rebirth: '2,18 34,34 62,36 92,20 118,6',
  };
  return (
    <ConceptFrame caption={t('concept.bookerCaption')}>
      <div className="md-shapes">
        {fw.items.map((it, i) => (
          <div className="md-shape" key={it.id}>
            <span className="md-shape-num">{i + 1}</span>
            <span className="md-shape-name">{it.name}</span>
            <svg viewBox="0 0 120 40" className="md-shape-svg" preserveAspectRatio="none">
              <line x1="0" y1="20" x2="120" y2="20" stroke="var(--border)" strokeDasharray="2 3" />
              <polyline
                points={shapes[it.id] ?? '2,20 118,20'}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        ))}
      </div>
    </ConceptFrame>
  );
}

// ── Schmidt — gender-paired master types ─────────────────────────────
function SchmidtPairs() {
  const { t } = useTranslation('frameworks');
  const fem = (t('concept.schmidtFemList') as string).split('|');
  const masc = (t('concept.schmidtMascList') as string).split('|');
  return (
    <ConceptFrame caption={t('concept.schmidtCaption')}>
      <div className="md-pairs">
        <div className="md-pairs-col">
          <div
            className="md-pairs-head"
            style={{ color: TINT.violet.fg, background: TINT.violet.bg, borderColor: TINT.violet.edge }}
          >
            {t('concept.schmidtFem')}
          </div>
          {fem.map((f, i) => (
            <div className="md-pairs-cell" key={i}>{f}</div>
          ))}
        </div>
        <div className="md-pairs-spine"><span>{t('concept.schmidtSpine')}</span></div>
        <div className="md-pairs-col">
          <div
            className="md-pairs-head"
            style={{ color: TINT.blue.fg, background: TINT.blue.bg, borderColor: TINT.blue.edge }}
          >
            {t('concept.schmidtMasc')}
          </div>
          {masc.map((m, i) => (
            <div className="md-pairs-cell" key={i}>{m}</div>
          ))}
        </div>
      </div>
      <div className="md-pairs-eq">
        8 {t('concept.schmidtEqFem')} + 8 {t('concept.schmidtEqMasc')} + {t('concept.schmidtEqSupp')} = <b>45</b>
      </div>
    </ConceptFrame>
  );
}

// ── SEP — state flow ────────────────────────────────────────────────
function SepFlow() {
  const { t } = useTranslation('frameworks');
  const data = [
    t('concept.sepData1'),
    t('concept.sepData2'),
    t('concept.sepData3'),
    t('concept.sepData4'),
  ];
  return (
    <ConceptFrame caption={t('concept.sepCaption')}>
      <svg viewBox="0 0 660 250" className="md-svg" style={{ maxWidth: 660 }}>
        <defs>
          <marker id="sep-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M1,1 L8,4.5 L1,8" fill="none" stroke="var(--fg-muted)" strokeWidth="1.5" />
          </marker>
        </defs>
        <rect x="8" y="30" width="392" height="120" rx="10" fill="var(--entity-loc-bg)" stroke="var(--entity-loc-border)" />
        <text x="20" y="50" className="md-svg-band" style={{ fill: 'var(--entity-loc-fg)' }}>{t('concept.sepDataLayer')}</text>
        {data.map((d, i) => {
          const x = 24 + i * 92;
          return (
            <g key={i}>
              <rect x={x} y="68" width="78" height="58" rx="8" fill="var(--bg-primary)" stroke="var(--entity-loc-border)" />
              <text x={x + 39} y="94" textAnchor="middle" className="md-svg-box">{d}</text>
              <text x={x + 39} y="110" textAnchor="middle" className="md-svg-boxnum">{i + 1}</text>
              {i < 3 && (
                <line x1={x + 78} y1="97" x2={x + 92} y2="97" stroke="var(--fg-muted)" strokeWidth="1.5" markerEnd="url(#sep-arrow)" />
              )}
            </g>
          );
        })}
        <rect x="430" y="30" width="222" height="190" rx="10" fill="var(--entity-con-bg)" stroke="var(--entity-con-border)" />
        <text x="442" y="50" className="md-svg-band" style={{ fill: 'var(--entity-con-fg)' }}>{t('concept.sepAiLayer')}</text>
        <rect x="448" y="66" width="186" height="56" rx="8" fill="var(--bg-primary)" stroke="var(--entity-con-border)" />
        <text x="541" y="90" textAnchor="middle" className="md-svg-box">{t('concept.sepLlm')}</text>
        <text x="541" y="106" textAnchor="middle" className="md-svg-boxnum">{t('concept.sepLlmSub')}</text>
        <rect x="448" y="146" width="186" height="56" rx="8" fill="var(--bg-primary)" stroke="var(--status-partial-border)" />
        <text x="541" y="170" textAnchor="middle" className="md-svg-box">{t('concept.sepHitl')}</text>
        <text x="541" y="186" textAnchor="middle" className="md-svg-boxnum">{t('concept.sepHitlSub')}</text>
        <line x1="400" y1="97" x2="448" y2="94" stroke="var(--fg-muted)" strokeWidth="1.5" markerEnd="url(#sep-arrow)" />
        <line x1="541" y1="122" x2="541" y2="146" stroke="var(--fg-muted)" strokeWidth="1.5" markerEnd="url(#sep-arrow)" />
        <path
          d="M 448 174 C 410 174 410 94 446 94"
          fill="none"
          stroke="var(--status-partial-border)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd="url(#sep-arrow)"
        />
        <text x="408" y="138" textAnchor="middle" className="md-svg-loop" style={{ fill: 'var(--status-partial-fg)' }}>
          {t('concept.sepReject')}
        </text>
      </svg>
    </ConceptFrame>
  );
}

export function ConceptDiagram({ fw }: { fw: Framework }) {
  switch (fw.key) {
    case 'jung':
      return <JungWheel fw={fw} />;
    case 'frye_mythos':
      return <FryeSeasons />;
    case 'hero_journey':
      return <HeroJourney />;
    case 'booker_plots':
      return <BookerShapes fw={fw} />;
    case 'schmidt':
      return <SchmidtPairs />;
    case 'sep_methodology':
      return <SepFlow />;
    default:
      return null;
  }
}
