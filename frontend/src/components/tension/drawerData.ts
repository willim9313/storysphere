import type { TEUSummary, TensionLineDetail } from './reviewTypes';

type Carrier = NonNullable<TEUSummary['pole_a_carriers']>[number];

export interface CarrierShare {
  name: string;
  entityType: string | null;
  /** How many TEUs put this carrier on this pole, e.g. 3 of 6. */
  count: number;
  total: number;
}

export interface PoleView {
  /** Aggregated stance text — the backend has no per-pole description field. */
  description: string | null;
  carriers: CarrierShare[];
}

export interface DrawerView {
  poleA: PoleView;
  poleB: PoleView;
  flippedCount: number;
  teuCount: number;
}

/**
 * Build the drawer's two pole panels from a line's TEUs.
 *
 * The critical part is `flipped`: grouping never normalises pole order, so a
 * TEU flagged flipped has its A carriers on what the line calls B. Aggregating
 * without swapping those back is what produced the original bug where both
 * poles listed the identical set of names and the pills carried no information.
 *
 * Carriers are ranked by how often they appear and capped at the top four, per
 * the design; the share is shown so a carrier that only turns up once reads as
 * weaker evidence than one present throughout.
 */
export function buildDrawerView(line: TensionLineDetail): DrawerView {
  const teus = line.teus ?? [];
  const total = teus.length;

  const tallyA = new Map<string, CarrierShare>();
  const tallyB = new Map<string, CarrierShare>();
  const stancesA: string[] = [];
  const stancesB: string[] = [];
  let flippedCount = 0;

  for (const teu of teus) {
    const isFlipped = teu.flipped === true;
    if (isFlipped) flippedCount += 1;

    const aCarriers = (isFlipped ? teu.pole_b_carriers : teu.pole_a_carriers) ?? [];
    const bCarriers = (isFlipped ? teu.pole_a_carriers : teu.pole_b_carriers) ?? [];
    const aStance = isFlipped ? teu.pole_b_stance : teu.pole_a_stance;
    const bStance = isFlipped ? teu.pole_a_stance : teu.pole_b_stance;

    tally(tallyA, aCarriers, total);
    tally(tallyB, bCarriers, total);
    if (aStance) stancesA.push(aStance);
    if (bStance) stancesB.push(bStance);
  }

  return {
    poleA: { description: pickStance(stancesA), carriers: topCarriers(tallyA) },
    poleB: { description: pickStance(stancesB), carriers: topCarriers(tallyB) },
    flippedCount,
    teuCount: total,
  };
}

function tally(into: Map<string, CarrierShare>, carriers: Carrier[], total: number) {
  // Within one TEU the same name can appear twice; count the TEU, not the entry.
  const seen = new Set<string>();
  for (const c of carriers) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    const prev = into.get(c.name);
    if (prev) {
      prev.count += 1;
      // A name may resolve to a KG entity in one TEU and not in another; keep
      // whichever typing we managed to get.
      prev.entityType = prev.entityType ?? c.entity_type ?? null;
    } else {
      into.set(c.name, {
        name: c.name,
        entityType: c.entity_type ?? null,
        count: 1,
        total,
      });
    }
  }
}

function topCarriers(tally: Map<string, CarrierShare>): CarrierShare[] {
  return [...tally.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 4);
}

/**
 * The longest stance seen on this pole, as a stand-in for a pole description.
 *
 * A stance says how *these carriers* embody the pole, which is not the same as
 * defining the pole — a known gap, kept rather than left blank because the
 * longest one is usually the most self-contained sentence.
 */
function pickStance(stances: string[]): string | null {
  if (stances.length === 0) return null;
  return stances.reduce((longest, s) => (s.length > longest.length ? s : longest));
}
