import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Framework } from '@/data/frameworksData';

/*
 * 八張概念圖：各自不同結構，不正規化成同一版型。
 * Ink 下 --entity-* 與 status 色會退成同一個灰，所以每個「分類層」都帶非色相載體：
 *   - 填色之上疊 0／45／90／135° 的 hatch（SVG pattern）
 *   - 節點分組用記號形狀（實圓／空圓／實方／空方）＋半徑差
 *   - 邊用實線／虛線與有無箭頭
 * 不新增色相；SVG 內一律 var(--*)。
 */

type Tint = { bg: string; fg: string; edge: string; dot: string };

const TINT: Record<'green' | 'amber' | 'blue' | 'red' | 'violet', Tint> = {
  green: { bg: 'var(--entity-loc-bg)', fg: 'var(--entity-loc-fg)', edge: 'var(--entity-loc-border)', dot: 'var(--entity-loc-dot)' },
  amber: { bg: 'var(--entity-org-bg)', fg: 'var(--entity-org-fg)', edge: 'var(--entity-org-border)', dot: 'var(--entity-org-dot)' },
  blue: { bg: 'var(--entity-char-bg)', fg: 'var(--entity-char-fg)', edge: 'var(--entity-char-border)', dot: 'var(--entity-char-dot)' },
  red: { bg: 'var(--entity-evt-bg)', fg: 'var(--entity-evt-fg)', edge: 'var(--entity-evt-border)', dot: 'var(--entity-evt-dot)' },
  violet: { bg: 'var(--entity-con-bg)', fg: 'var(--entity-con-fg)', edge: 'var(--entity-con-border)', dot: 'var(--entity-con-dot)' },
};

/** 記號形狀：0 實圓、1 空圓、2 實方、3 空方。 */
type MarkKind = 0 | 1 | 2 | 3;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function wedge(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${cx},${cy} L${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r},${r} 0 ${large} 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)} Z`;
}

function Hatch({ id, angle, stroke }: { id: string; angle: number; stroke: string }) {
  return (
    <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
      <line x1="0" y1="0" x2="0" y2="7" stroke={stroke} strokeWidth="1" opacity="0.5" />
    </pattern>
  );
}

function Mark({ kind, x, y, r, color }: { kind: MarkKind; x: number; y: number; r: number; color: string }) {
  if (kind === 0) return <circle cx={x} cy={y} r={r} fill={color} stroke="var(--bg-primary)" strokeWidth="1.5" />;
  if (kind === 1) return <circle cx={x} cy={y} r={r} fill="var(--bg-primary)" stroke={color} strokeWidth="2" />;
  if (kind === 2) {
    return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill={color} stroke="var(--bg-primary)" strokeWidth="1.5" />;
  }
  return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill="var(--bg-primary)" stroke={color} strokeWidth="2" />;
}

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
      <path d="M1,1 L8,4.5 L1,8" fill="none" stroke={color} strokeWidth="1.5" />
    </marker>
  );
}

/** 圖例小色塊：底色＋hatch＋記號形狀，與圖內同一組載體。 */
function Swatch({ id, tint, angle, kind }: { id: string; tint: Tint; angle: number; kind: MarkKind }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="md-swatch" aria-hidden="true">
      <defs>
        <Hatch id={id} angle={angle} stroke={tint.edge} />
      </defs>
      <rect x="0.5" y="0.5" width="19" height="19" fill={tint.bg} stroke={tint.edge} />
      <rect x="0.5" y="0.5" width="19" height="19" fill={`url(#${id})`} stroke="none" />
      <Mark kind={kind} x={10} y={10} r={4.5} color={tint.dot} />
    </svg>
  );
}

function ConceptFrame({ fw, caption, children }: { fw: Framework; caption: string; children: ReactNode }) {
  const { t } = useTranslation('frameworks');
  return (
    <div className="md-concept">
      <div className="md-concept-head">
        <span className={`md-confbadge ${fw.hasConfidence ? 'has' : 'none'}`}>
          {fw.hasConfidence ? t('confBadgeHas') : t('confBadgeNone')}
        </span>
      </div>
      <div className="md-concept-stage">{children}</div>
      {caption && <p className="md-concept-cap">{caption}</p>}
    </div>
  );
}

// ── Jung archetype wheel：輪盤 460×410，無序 12 個並列位置 ──────────────────
function JungWheel({ fw }: { fw: Framework }) {
  const { t } = useTranslation('frameworks');
  const nameOf = (id: string) => fw.items.find((x) => x.id === id)?.name ?? id;
  const groups: { tint: Tint; kind: MarkKind; label: string; ids: string[] }[] = [
    { tint: TINT.red, kind: 0, label: t('concept.jungChange'), ids: ['hero', 'rebel', 'magician'] },
    { tint: TINT.amber, kind: 2, label: t('concept.jungOrder'), ids: ['caregiver', 'creator', 'ruler'] },
    { tint: TINT.blue, kind: 1, label: t('concept.jungBelonging'), ids: ['jester', 'lover', 'orphan'] },
    { tint: TINT.green, kind: 3, label: t('concept.jungIndep'), ids: ['innocent', 'sage', 'explorer'] },
  ];
  const cx = 230;
  const cy = 195;
  const R = 132;
  const labR = 170;
  return (
    <ConceptFrame fw={fw} caption={t('concept.jungCaption')}>
      <svg viewBox="0 0 460 410" className="md-svg" style={{ maxWidth: 460 }}>
        <defs>
          {groups.map((g, gi) => (
            <Hatch key={gi} id={`md-jung-h${gi}`} angle={gi * 45} stroke={g.tint.edge} />
          ))}
        </defs>
        {groups.map((g, gi) => {
          const d = wedge(cx, cy, R, gi * 90, gi * 90 + 90);
          const mid = polar(cx, cy, R * 0.73, gi * 90 + 45);
          return (
            <g key={gi}>
              <path d={d} fill={g.tint.bg} stroke="var(--bg-primary)" strokeWidth="2" />
              <path d={d} fill={`url(#md-jung-h${gi})`} stroke="none" />
              <text x={mid.x} y={mid.y + 4} textAnchor="middle" className="md-svg-wedge" style={{ fill: g.tint.fg }}>
                {g.label}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="58" fill="var(--bg-primary)" stroke="var(--border)" />
        <text x={cx} y={cy - 2} textAnchor="middle" className="md-svg-center">{t('concept.jungCenter')}</text>
        <text x={cx} y={cy + 20} textAnchor="middle" className="md-svg-centersub">{t('concept.jungCenterSub')}</text>
        {groups.map((g, gi) =>
          g.ids.map((id, di) => {
            const ang = gi * 90 + 15 + di * 30;
            const p = polar(cx, cy, R, ang);
            const lp = polar(cx, cy, labR, ang);
            const anchor = Math.abs(lp.x - cx) < 12 ? 'middle' : lp.x < cx ? 'end' : 'start';
            return (
              <g key={id}>
                <Mark kind={g.kind} x={p.x} y={p.y} r={6} color={g.tint.dot} />
                <text x={lp.x} y={lp.y + 4} textAnchor={anchor} className="md-svg-label">{nameOf(id)}</text>
              </g>
            );
          }),
        )}
      </svg>
      <div className="md-concept-legend">
        {groups.map((g, gi) => (
          <div className="md-legchip" key={gi}>
            <Swatch id={`md-jung-l${gi}`} tint={g.tint} angle={gi * 45} kind={g.kind} />
            <span className="md-legchip-name">{g.label}</span>
            <span className="md-legchip-note">{g.ids.length}</span>
          </div>
        ))}
      </div>
    </ConceptFrame>
  );
}

// ── Frye four-season cycle：四季圓環 400×410，季節／神話名／登錄詞三層文字 ──
function FryeSeasons({ fw }: { fw: Framework }) {
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
    <ConceptFrame fw={fw} caption={t('concept.fryeCaption')}>
      <svg viewBox="0 0 400 410" className="md-svg" style={{ maxWidth: 400 }}>
        <defs>
          <ArrowMarker id="frye-arrow" color="var(--fg-secondary)" />
          {seasons.map((s, i) => (
            <Hatch key={i} id={`md-frye-h${i}`} angle={i * 45} stroke={s.tint.edge} />
          ))}
        </defs>
        {seasons.map((s, i) => {
          const d = wedge(cx, cy, R, i * 90, i * 90 + 90);
          const mid = polar(cx, cy, R * 0.66, i * 90 + 45);
          return (
            <g key={i}>
              <path d={d} fill={s.tint.bg} stroke="var(--bg-primary)" strokeWidth="2.5" />
              <path d={d} fill={`url(#md-frye-h${i})`} stroke="none" />
              <text x={mid.x} y={mid.y - 14} textAnchor="middle" className="md-svg-season" style={{ fill: s.tint.fg }}>{s.season}</text>
              <text x={mid.x} y={mid.y + 6} textAnchor="middle" className="md-svg-mythos" style={{ fill: s.tint.fg }}>{s.mythos}</text>
              <text x={mid.x} y={mid.y + 24} textAnchor="middle" className="md-svg-reg" style={{ fill: s.tint.fg }}>{s.reg}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="40" fill="var(--bg-primary)" stroke="var(--border)" />
        <text x={cx} y={cy - 2} textAnchor="middle" className="md-svg-centersub">{t('concept.fryeCenter')}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="md-svg-centersub">{t('concept.fryeCenterSub')}</text>
        {/* 循環方向：四段外弧各帶一個箭頭（春→夏→秋→冬→春，順時針） */}
        {seasons.map((_, i) => {
          const rr = R + 14;
          const p0 = polar(cx, cy, rr, i * 90 + 12);
          const p1 = polar(cx, cy, rr, i * 90 + 78);
          return (
            <path
              key={i}
              d={`M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A${rr} ${rr} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`}
              fill="none"
              stroke="var(--fg-secondary)"
              strokeWidth="1.5"
              markerEnd="url(#frye-arrow)"
            />
          );
        })}
      </svg>
    </ConceptFrame>
  );
}

// ── Hero's Journey：階段環 400×400，兩個世界 × 三幕 × 12 階段順序 ──────────
function HeroJourney({ fw }: { fw: Framework }) {
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
  const acts: { tint: Tint; kind: MarkKind; label: string; range: string }[] = [
    { tint: TINT.green, kind: 0, label: t('concept.hjDeparture'), range: '1–5' },
    { tint: TINT.red, kind: 2, label: t('concept.hjInitiation'), range: '6–9' },
    { tint: TINT.amber, kind: 1, label: t('concept.hjReturn'), range: '10–12' },
  ];
  return (
    <ConceptFrame fw={fw} caption={t('concept.hjCaption')}>
      <svg viewBox="0 0 400 400" className="md-svg" style={{ maxWidth: 380 }}>
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy} Z`} fill="var(--bg-secondary)" />
        <path d={`M ${cx + R} ${cy} A ${R} ${R} 0 0 1 ${cx - R} ${cy} Z`} fill="var(--bg-tertiary)" />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" />
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="var(--border)" strokeDasharray="3 3" />
        <text x={cx} y={cy - R + 26} textAnchor="middle" className="md-svg-world">{t('concept.hjOrdinary')}</text>
        <text x={cx} y={cy + R - 14} textAnchor="middle" className="md-svg-world">{t('concept.hjSpecial')}</text>
        <text x={cx} y={cy + 5} textAnchor="middle" className="md-svg-ring">{`${fw.items.length} ${fw.itemLabel}`}</text>
        {stages.map((s, i) => {
          const act = acts[s.act];
          const p = polar(cx, cy, R, (i / 12) * 360 + 15);
          return (
            <g key={s.n}>
              <Mark kind={act.kind} x={p.x} y={p.y} r={13} color={act.tint.dot} />
              <text
                x={p.x}
                y={p.y + 5}
                textAnchor="middle"
                className="md-svg-num"
                style={{ fill: act.kind === 1 ? act.tint.fg : 'var(--bg-primary)' }}
              >
                {s.n}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="md-hj-legend">
        {acts.map((a, ai) => (
          <div className="md-hj-act" key={ai}>
            <div className="md-hj-acthead">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <Mark kind={a.kind} x={8} y={8} r={5.5} color={a.tint.dot} />
              </svg>
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

// ── Booker：曲線族 120×40 ×7，兩欄七格；運勢正負 ＝ 虛線中性線之上／之下 ────
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
    <ConceptFrame fw={fw} caption={t('concept.bookerCaption')}>
      <div className="md-shapes">
        {fw.items.map((it, i) => (
          <div className="md-shape" key={it.id}>
            <span className="md-shape-num">{i + 1}</span>
            <span className="md-shape-name">{it.name}</span>
            <svg viewBox="0 0 120 40" className="md-shape-svg" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1="20" x2="120" y2="20" stroke="var(--border)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              <polyline
                points={shapes[it.id] ?? '2,20 118,20'}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        ))}
      </div>
    </ConceptFrame>
  );
}

// ── Schmidt：性別對偶脊（左八女神、右八男神，同列為一組對偶）──────────────
function SchmidtPairs({ fw }: { fw: Framework }) {
  const { t } = useTranslation('frameworks');
  const fem = (t('concept.schmidtFemList') as string).split('|');
  const masc = (t('concept.schmidtMascList') as string).split('|');
  return (
    <ConceptFrame fw={fw} caption={t('concept.schmidtCaption')}>
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
      <p className="md-pairs-note">{t('concept.schmidtNote')}</p>
    </ConceptFrame>
  );
}

// ── SEP：流程迴圈 660×250，兩條層帶 × 有向序列 × 實線推進／虛線退回 ─────────
function SepFlow({ fw }: { fw: Framework }) {
  const { t } = useTranslation('frameworks');
  const data = [
    t('concept.sepData1'),
    t('concept.sepData2'),
    t('concept.sepData3'),
    t('concept.sepData4'),
  ];
  return (
    <ConceptFrame fw={fw} caption={t('concept.sepCaption')}>
      <svg viewBox="0 0 660 250" className="md-svg" style={{ maxWidth: 660 }}>
        <defs>
          <ArrowMarker id="sep-arrow" color="var(--fg-muted)" />
          <ArrowMarker id="sep-arrow-warn" color="var(--status-partial-border)" />
          <Hatch id="md-sep-h1" angle={0} stroke={TINT.green.edge} />
          <Hatch id="md-sep-h2" angle={90} stroke={TINT.violet.edge} />
        </defs>
        <rect x="8" y="30" width="392" height="120" rx="10" fill={TINT.green.bg} stroke={TINT.green.edge} />
        <rect x="8" y="30" width="392" height="120" rx="10" fill="url(#md-sep-h1)" stroke="none" />
        <text x="20" y="52" className="md-svg-band" style={{ fill: TINT.green.fg }}>{t('concept.sepDataLayer')}</text>
        {data.map((d, i) => {
          const x = 24 + i * 92;
          return (
            <g key={i}>
              <rect x={x} y="68" width="78" height="58" rx="8" fill="var(--bg-primary)" stroke={TINT.green.edge} />
              <text x={x + 39} y="94" textAnchor="middle" className="md-svg-box">{d}</text>
              <text x={x + 39} y="112" textAnchor="middle" className="md-svg-boxnum">{i + 1}</text>
              {i < 3 && (
                <line x1={x + 78} y1="97" x2={x + 92} y2="97" stroke="var(--fg-muted)" strokeWidth="1.5" markerEnd="url(#sep-arrow)" />
              )}
            </g>
          );
        })}
        <rect x="430" y="30" width="222" height="190" rx="10" fill={TINT.violet.bg} stroke={TINT.violet.edge} />
        <rect x="430" y="30" width="222" height="190" rx="10" fill="url(#md-sep-h2)" stroke="none" />
        <text x="442" y="52" className="md-svg-band" style={{ fill: TINT.violet.fg }}>{t('concept.sepAiLayer')}</text>
        <rect x="448" y="66" width="186" height="56" rx="8" fill="var(--bg-primary)" stroke={TINT.violet.edge} />
        <text x="541" y="90" textAnchor="middle" className="md-svg-box">{t('concept.sepLlm')}</text>
        <text x="541" y="108" textAnchor="middle" className="md-svg-boxnum">{t('concept.sepLlmSub')}</text>
        <rect x="448" y="146" width="186" height="56" rx="8" fill="var(--bg-primary)" stroke="var(--status-partial-border)" strokeWidth="1.5" />
        <text x="541" y="170" textAnchor="middle" className="md-svg-box">{t('concept.sepHitl')}</text>
        <text x="541" y="188" textAnchor="middle" className="md-svg-boxnum">{t('concept.sepHitlSub')}</text>
        <line x1="400" y1="97" x2="448" y2="94" stroke="var(--fg-muted)" strokeWidth="1.5" markerEnd="url(#sep-arrow)" />
        <line x1="541" y1="122" x2="541" y2="146" stroke="var(--fg-muted)" strokeWidth="1.5" markerEnd="url(#sep-arrow)" />
        <path
          d="M 448 174 C 410 174 410 94 446 94"
          fill="none"
          stroke="var(--status-partial-border)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd="url(#sep-arrow-warn)"
        />
        <text x="410" y="194" textAnchor="middle" className="md-svg-loop" style={{ fill: 'var(--status-partial-fg)' }}>
          {t('concept.sepReject')}
        </text>
      </svg>
    </ConceptFrame>
  );
}

// ── Chatman：因果鏈 560×190，kernel（半徑 20、實線填色、有箭頭）vs satellite（半徑 14、虛線空心、無箭頭）──
function ChatmanChain({ fw }: { fw: Framework }) {
  const { t } = useTranslation('frameworks');
  const cy = 58;
  const sy = 148;
  const kx = [70, 280, 490];
  const satX = [175, 385];
  return (
    <ConceptFrame fw={fw} caption={t('concept.chatmanCaption')}>
      <svg viewBox="0 0 560 190" className="md-svg" style={{ maxWidth: 560 }}>
        <defs>
          <ArrowMarker id="chatman-arrow" color={TINT.red.fg} />
        </defs>
        <text x={kx[0] - 46} y={cy - 30} className="md-svg-band" style={{ fill: TINT.red.fg }}>
          {t('concept.chatmanKernel')}
        </text>
        {kx.slice(0, -1).map((x, i) => (
          <line
            key={i}
            x1={x + 22} y1={cy} x2={kx[i + 1] - 24} y2={cy}
            stroke={TINT.red.fg} strokeWidth="2" markerEnd="url(#chatman-arrow)"
          />
        ))}
        {kx.map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={cy} r="20" fill={TINT.red.bg} stroke={TINT.red.edge} strokeWidth="1.5" />
            <text x={x} y={cy + 5} textAnchor="middle" className="md-svg-node">{`K${i + 1}`}</text>
          </g>
        ))}
        {satX.map((x, i) => (
          <g key={i}>
            <line
              x1={x} y1={cy + 20} x2={x} y2={sy - 15}
              stroke="var(--fg-muted)" strokeWidth="1.5" strokeDasharray="3 3"
            />
            <circle cx={x} cy={sy} r="14" fill="var(--bg-primary)" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x={x} y={sy + 5} textAnchor="middle" className="md-svg-node sat">{`S${i + 1}`}</text>
          </g>
        ))}
        <text x={satX[0] - 46} y={sy + 36} className="md-svg-band" style={{ fill: 'var(--fg-muted)' }}>
          {t('concept.chatmanSatellite')}
        </text>
      </svg>
    </ConceptFrame>
  );
}

// ── Genette：雙軸交叉 460×230；上軸＝文本順序，下軸＝故事順序（C 最先發生在左、A 最後在右）──
function GenetteOrder({ fw }: { fw: Framework }) {
  const { t } = useTranslation('frameworks');
  const topY = 50;
  const botY = 170;
  const x = [90, 230, 370];
  const analepsis = TINT.blue;
  const prolepsis = TINT.violet;
  // 下軸節點依故事順序由左到右：C、B、A（A 敘述在前、發生在後 ＝ 預敘；C 反之 ＝ 倒敘）
  const bottom: { cx: number; label: string; tint: Tint | null }[] = [
    { cx: x[0], label: 'C', tint: analepsis },
    { cx: x[1], label: 'B', tint: null },
    { cx: x[2], label: 'A', tint: prolepsis },
  ];
  return (
    <ConceptFrame fw={fw} caption={t('concept.genetteCaption')}>
      <svg viewBox="0 0 460 230" className="md-svg" style={{ maxWidth: 460 }}>
        <text x="40" y="26" className="md-svg-band" style={{ fill: 'var(--fg-secondary)' }}>
          {t('concept.genetteTextAxis')}
        </text>
        <line x1="40" y1={topY} x2="420" y2={topY} stroke="var(--border)" strokeWidth="1.5" />
        <text x="40" y="214" className="md-svg-band" style={{ fill: 'var(--fg-secondary)' }}>
          {t('concept.genetteStoryAxis')}
        </text>
        <line x1="40" y1={botY} x2="420" y2={botY} stroke="var(--border)" strokeWidth="1.5" />

        {/* A：敘述最先、發生最後 → 預敘（疏虛線） */}
        <line x1={x[0]} y1={topY + 16} x2={x[2]} y2={botY - 16} stroke={prolepsis.fg} strokeWidth="2" strokeDasharray="6 4" />
        {/* B：順序，無位移（實線） */}
        <line x1={x[1]} y1={topY + 16} x2={x[1]} y2={botY - 16} stroke="var(--fg-muted)" strokeWidth="2" />
        {/* C：敘述最後、發生最先 → 倒敘（密虛線） */}
        <line x1={x[2]} y1={topY + 16} x2={x[0]} y2={botY - 16} stroke={analepsis.fg} strokeWidth="2" strokeDasharray="2 3" />

        {['A', 'B', 'C'].map((label, i) => (
          <g key={label}>
            <circle cx={x[i]} cy={topY} r="16" fill="var(--bg-primary)" stroke="var(--border)" strokeWidth="1.5" />
            <text x={x[i]} y={topY + 5} textAnchor="middle" className="md-svg-node">{label}</text>
          </g>
        ))}
        {bottom.map((b) => (
          <g key={b.label}>
            <circle
              cx={b.cx} cy={botY} r="16"
              fill={b.tint ? b.tint.bg : 'var(--bg-primary)'}
              stroke={b.tint ? b.tint.edge : 'var(--border)'}
              strokeWidth="1.5"
            />
            <text x={b.cx} y={botY + 5} textAnchor="middle" className="md-svg-node">{b.label}</text>
          </g>
        ))}

        <text x={x[1]} y={topY - 24} textAnchor="middle" className="md-svg-loop" style={{ fill: 'var(--fg-muted)' }}>
          {t('concept.genetteLinear')}
        </text>
        {/* 位移標籤放在兩條交叉線之間的空白帶，不壓到軸名 */}
        <text x="160" y={(topY + botY) / 2 + 4} textAnchor="middle" className="md-svg-loop" style={{ fill: analepsis.fg }}>
          {t('concept.genetteAnalepsis')}
        </text>
        <text x="300" y={(topY + botY) / 2 + 4} textAnchor="middle" className="md-svg-loop" style={{ fill: prolepsis.fg }}>
          {t('concept.genetteProlepsis')}
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
      return <FryeSeasons fw={fw} />;
    case 'hero_journey':
      return <HeroJourney fw={fw} />;
    case 'booker_plots':
      return <BookerShapes fw={fw} />;
    case 'schmidt':
      return <SchmidtPairs fw={fw} />;
    case 'sep_methodology':
      return <SepFlow fw={fw} />;
    case 'chatman':
      return <ChatmanChain fw={fw} />;
    case 'genette_temporal_order':
      return <GenetteOrder fw={fw} />;
    default:
      return null;
  }
}
