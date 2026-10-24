import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ChevronRight } from 'lucide-react';
import type { CharacterAnalysisDetail } from '@/api/types';
import type { NameIdEntry } from '../CharacterAnalysisDetail';
import { useSourceJump } from '@/hooks/useSourceJump';
import { SourceJumpText } from '../SourceJumpText';
import { Tooltip } from '@/components/ui/Tooltip';
import { useElementWidth } from '@/hooks/useElementWidth';
import { isQuoted } from '../characterModel';

interface Props {
  data: CharacterAnalysisDetail;
  bookId: string;
  /** #3: name -> id lookup over the full character roster (analyzed +
   * unanalyzed), used to decide whether a relation target / ego-network node
   * is a known character and can be clicked to switch to it. */
  characterRoster: NameIdEntry[];
  onSelectCharacter: (entityId: string) => void;
}

type Relation = { target: string; type: string; description: string };

// DESIGN_README dict: canvas relation types -> abbreviated entity token.
// Keys cover the CEP prompt's canonical machine codes (enemy/ally/…) plus the
// legacy zh-TW free-text strings still present in older cached analyses.
// Any type string not in this map falls back to "other" per the design's
// fallback rule.
const TYPE_TOKEN: Record<string, string> = {
  enemy: 'evt',
  ally: 'loc',
  subordinate: 'org',
  member: 'con',
  other: 'other',
  敵人: 'evt',
  盟友: 'loc',
  下屬: 'org',
  成員: 'con',
  其他: 'other',
};
// Relation type -> canonical code; the visible label comes from i18n
// (`character.relations.types.*` / `typesShort.*`) so the en UI isn't zh.
const TYPE_CODE: Record<string, string> = {
  enemy: 'enemy',
  ally: 'ally',
  subordinate: 'subordinate',
  member: 'member',
  other: 'other',
  敵人: 'enemy',
  盟友: 'ally',
  下屬: 'subordinate',
  成員: 'member',
  其他: 'other',
};

function tokenFor(type: string): string {
  return TYPE_TOKEN[type] ?? 'other';
}
function labelFor(type: string, t: TFunction<'analysis'>): string {
  const code = TYPE_CODE[type];
  return code ? t(`character.relations.types.${code}`) : type;
}
function midLabelFor(type: string, t: TFunction<'analysis'>): string {
  const code = TYPE_CODE[type];
  return code ? t(`character.relations.typesShort.${code}`) : type.charAt(0);
}

const EGO_BADGE_W = 30;
const EGO_BADGE_H = 14;
const nodeRadius = (target: string) => (target.length > 2 ? 22 : 18);

function groupByTarget(relations: Relation[]): Map<string, Relation[]> {
  const groups = new Map<string, Relation[]>();
  for (const r of relations) {
    const list = groups.get(r.target);
    if (list) list.push(r);
    else groups.set(r.target, [r]);
  }
  return groups;
}

// The svg is drawn at its real pixel width (see useElementWidth): the ellipse
// stretches with the card, nodes and text stay at fixed px. A fixed 640-wide
// viewBox scaled names from ~4.6px (720 window) to ~16px (1440).
const EGO_FALLBACK_W = 640;
const EGO_CY = 146;
const EGO_RY = 116;
const EGO_H = EGO_CY * 2 + 14;
const EGO_SIDE = 46; // room for the outermost node + its badge
const EGO_MIN_RX = 90;
const EGO_MAX_RX = 380;

export function RelationsPane({ data, bookId, characterRoster, onSelectCharacter }: Props) {
  const { t } = useTranslation('analysis');
  const { jump, pendingKey } = useSourceJump(bookId);
  const [stageRef, measuredW] = useElementWidth<HTMLDivElement>();
  const EGO_W = measuredW > 0 ? measuredW : EGO_FALLBACK_W;
  const EGO_CX = EGO_W / 2;
  const EGO_RX = Math.min(EGO_MAX_RX, Math.max(EGO_MIN_RX, EGO_CX - EGO_SIDE));
  const cepRelations = data.cep?.relations;
  const relations = useMemo(() => (cepRelations ?? []) as Relation[], [cepRelations]);
  const quotes = data.cep?.quotes ?? [];

  const rosterByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of characterRoster) m.set(c.name, c.id);
    return m;
  }, [characterRoster]);

  const groups = useMemo(() => groupByTarget(relations), [relations]);
  const targets = useMemo(() => [...groups.keys()], [groups]);
  const typesPresent = useMemo(() => {
    const seen: string[] = [];
    for (const r of relations) if (!seen.includes(r.type)) seen.push(r.type);
    return seen;
  }, [relations]);

  const nodes = useMemo(() => {
    const n = targets.length;
    return targets.map((target, i) => {
      const angle = -Math.PI / 2 + (i / Math.max(n, 1)) * 2 * Math.PI;
      return {
        target,
        rels: groups.get(target) ?? [],
        x: EGO_CX + EGO_RX * Math.cos(angle),
        y: EGO_CY + EGO_RY * Math.sin(angle),
        clickable: rosterByName.has(target),
      };
    });
  }, [targets, groups, rosterByName, EGO_CX, EGO_RX]);

  if (relations.length === 0) {
    return (
      <>
        <section className="ca-section">
          <header className="ca-section-head">
            <div>
              <h2 className="ca-section-title">{t('character.sections.relations')}</h2>
              <div className="ca-section-sub">
                {t('character.relations.relationsCount', { count: 0 })}
              </div>
            </div>
          </header>
          <div className="ca-section-body">
            <p>{t('character.noData')}</p>
          </div>
        </section>
        {renderQuotes()}
      </>
    );
  }

  function renderQuotes() {
    return (
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h2 className="ca-section-title">{t('character.sections.quotes')}</h2>
            <div className="ca-section-sub">
              {t('character.relations.quotesCount', { count: quotes.length })}
            </div>
          </div>
        </header>
        <div className="ca-section-body">
          {quotes.length === 0 ? (
            <p>{t('character.noData')}</p>
          ) : (
            quotes.map((q, i) => {
              const key = `quote-${i}`;
              return (
                <blockquote key={key} className="ca-quote">
                  {!isQuoted(q) && '「'}
                  <SourceJumpText
                    text={q}
                    pending={pendingKey === key}
                    onJump={() => void jump(key, q)}
                  />
                  {!isQuoted(q) && '」'}
                </blockquote>
              );
            })
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="ca-section">
        <header className="ca-section-head">
          <div>
            <h2 className="ca-section-title">{t('character.sections.relations')}</h2>
            <div className="ca-section-sub">
              {t('character.relations.relationsSummary', {
                targets: groups.size,
                count: relations.length,
              })}
            </div>
          </div>
        </header>
        <div className="ca-section-body">
          {/* Ego network */}
          <div className="ca-ego-wrap">
            <div className="ca-ego-caption">
              {t('character.relations.egoCaption', { name: data.entityName })}
            </div>
            <div className="ca-ego-stage" ref={stageRef}>
            <svg viewBox={`0 0 ${EGO_W} ${EGO_H}`} width="100%" className="ca-ego-svg">
              {nodes.map((n, i) => {
                const m = n.rels.length;
                const dx = n.x - EGO_CX;
                const dy = n.y - EGO_CY;
                const len = Math.hypot(dx, dy) || 1;
                const px = -dy / len;
                const py = dx / len;
                const mx = (EGO_CX + n.x) / 2;
                const my = (EGO_CY + n.y) / 2;
                return (
                  <g key={`e${i}`}>
                    {n.rels.map((r, j) => {
                      const offset = (j - (m - 1) / 2) * 17;
                      const token = tokenFor(r.type);
                      const qx = mx + px * offset;
                      const qy = my + py * offset;
                      const lx = 0.28 * EGO_CX + 0.5 * qx + 0.22 * n.x;
                      const ly = 0.28 * EGO_CY + 0.5 * qy + 0.22 * n.y;
                      return (
                        <g key={j}>
                          <path
                            d={`M${EGO_CX} ${EGO_CY} Q${qx} ${qy} ${n.x} ${n.y}`}
                            fill="none"
                            style={{ stroke: `var(--entity-${token}-dot)` }}
                            strokeWidth={1.6}
                            opacity={0.7}
                          />
                          <text
                            x={lx}
                            y={ly + 3}
                            textAnchor="middle"
                            className="ca-ego-midlabel"
                            style={{
                              fill: `var(--entity-${token}-fg)`,
                              stroke: 'var(--bg-secondary)',
                              strokeWidth: 3,
                              paintOrder: 'stroke',
                            }}
                          >
                            {midLabelFor(r.type, t)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
              {nodes.map((n, i) => {
                const long = n.target.length > 2;
                const r = nodeRadius(n.target);
                const multi = n.rels.length > 1;
                return (
                  <g key={`n${i}`} className={n.clickable ? 'ca-ego-node clickable' : 'ca-ego-node'}>
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      className="ca-ego-node-circle"
                      style={{ stroke: n.clickable ? 'var(--accent)' : 'var(--border)' }}
                    />
                    <text
                      x={n.x}
                      y={n.y + 4}
                      textAnchor="middle"
                      className="ca-ego-node-label"
                      style={{
                        fontSize: long ? 10 : 12,
                        fill: n.clickable ? 'var(--accent)' : 'var(--fg-primary)',
                      }}
                    >
                      {n.target}
                    </text>
                    {multi && (
                      <g className="ca-ego-badge">
                        <rect x={n.x + r * 0.35} y={n.y - r - 6} width={EGO_BADGE_W} height={EGO_BADGE_H} rx={EGO_BADGE_H / 2} />
                        <text x={n.x + r * 0.35 + EGO_BADGE_W / 2} y={n.y - r - 6 + EGO_BADGE_H - 3.5} textAnchor="middle">
                          {t('character.relations.segmentCount', { count: n.rels.length })}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              <circle cx={EGO_CX} cy={EGO_CY} r={28} className="ca-ego-hub-circle" />
              <text x={EGO_CX} y={EGO_CY + 5} textAnchor="middle" className="ca-ego-hub-label">
                {data.entityName}
              </text>
            </svg>
            {/* The native SVG <title> is replaced by the DS Tooltip. A Tooltip is
                an HTML portal anchored on a DOM element and cannot wrap an SVG
                <g>, so each node gets a transparent HTML hit target laid over
                it (positioned in % of the svg box, which matches the viewBox 1:1).
                Clickable nodes are real buttons — keyboard reachable too. */}
            {nodes.map((n) => {
              const r = nodeRadius(n.target);
              const label = `${n.target} · ${n.rels.map((x) => labelFor(x.type, t)).join(' / ')}`;
              const id = rosterByName.get(n.target);
              return (
                <div
                  key={`h-${n.target}`}
                  className="ca-ego-hitpos"
                  style={{
                    left: `${(n.x / EGO_W) * 100}%`,
                    top: `${(n.y / EGO_H) * 100}%`,
                    width: `${((r * 2) / EGO_W) * 100}%`,
                  }}
                >
                  <Tooltip label={label}>
                    {n.clickable && id ? (
                      <button
                        type="button"
                        className="ca-ego-hit clickable"
                        aria-label={label}
                        onClick={() => onSelectCharacter(id)}
                      />
                    ) : (
                      <span className="ca-ego-hit" />
                    )}
                  </Tooltip>
                </div>
              );
            })}
            </div>
            <div className="ca-ego-legend">
              {typesPresent.map((ty) => {
                const token = tokenFor(ty);
                return (
                  <span key={ty} className="ca-ego-legend-item">
                    <span
                      className="ca-ego-legend-dot"
                      style={{
                        background: `var(--entity-${token}-bg)`,
                        borderColor: `var(--entity-${token}-dot)`,
                      }}
                    />
                    {labelFor(ty, t)}
                  </span>
                );
              })}
              <span className="ca-ego-legend-note">{t('character.relations.egoLegendNote')}</span>
            </div>
          </div>

          {/* Grouped relation cards */}
          <div className="ca-rel-card-grid">
            {[...groups.entries()].map(([target, rels]) => {
              const clickable = rosterByName.has(target);
              const headChildren = (
                <>
                  <span className="ca-rel-card-target">{target}</span>
                  {rels.length > 1 && (
                    <span className="ca-rel-card-count">
                      {t('character.relations.segmentCount', { count: rels.length })}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  {clickable && <ChevronRight size={13} />}
                </>
              );
              return (
                <div key={target} className="ca-rel-card">
                  {clickable ? (
                    <button
                      type="button"
                      className="ca-rel-card-head clickable"
                      onClick={() => {
                        const id = rosterByName.get(target);
                        if (id) onSelectCharacter(id);
                      }}
                    >
                      {headChildren}
                    </button>
                  ) : (
                    <div className="ca-rel-card-head">{headChildren}</div>
                  )}
                  <div className="ca-rel-card-body">
                    {rels.map((r, i) => {
                      const token = tokenFor(r.type);
                      return (
                        <div key={i} className="ca-rel-card-row">
                          <span
                            className="ca-rel-pill"
                            style={{
                              background: `var(--entity-${token}-bg)`,
                              color: `var(--entity-${token}-fg)`,
                              borderColor: `var(--entity-${token}-dot)`,
                            }}
                          >
                            <span
                              className="ca-rel-pill-dot"
                              style={{ background: `var(--entity-${token}-dot)` }}
                            />
                            {labelFor(r.type, t)}
                          </span>
                          <div className="ca-rel-card-desc">{r.description}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {renderQuotes()}
    </>
  );
}
