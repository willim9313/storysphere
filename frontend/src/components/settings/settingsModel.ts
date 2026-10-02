/** 設定頁（/settings）的純邏輯：能力落差的歸類、遷移門檻、唯讀值的灰階判斷。 */

export type KgBackend = 'networkx' | 'neo4j';

/** 後端 `unsupportedByMode` 會回報的功能 id（`kg_service_neo4j.py::UNSUPPORTED`）。
 *  與 i18n `env.kgFeature.*` 一一對應；不在這裡的 id 一律不得裸露在畫面上。 */
export const KNOWN_KG_FEATURES = [
  'graph',
  'character_metrics',
  'factions',
  'link_prediction',
  'epistemic_state',
] as const;

export interface FeatureSplit {
  /** 有中文名的功能 id，保留後端順序、去重。 */
  known: string[];
  /** 沒有中文名的 id 數；畫面上合併成一顆「其他功能」，不顯示原始 id。 */
  unknownCount: number;
}

export function splitFeatureIds(ids: readonly string[]): FeatureSplit {
  const seen = new Set<string>();
  const known: string[] = [];
  let unknownCount = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    if ((KNOWN_KG_FEATURES as readonly string[]).includes(id)) known.push(id);
    else unknownCount += 1;
  }
  return { known, unknownCount };
}

export type GapLayer =
  | { kind: 'none' }
  /** 措辭一：目前後端就缺這些（已在發生）。 */
  | { kind: 'now'; ids: string[] }
  /** 措辭二：目前沒缺口，切到另一個後端才會失去（尚未發生、可避免）。 */
  | { kind: 'ifSwitch'; ids: string[]; otherMode: KgBackend };

/** 兩種措辭互斥：目前有缺口只畫措辭一；目前沒缺口且另一邊有，才畫措辭二。 */
export function gapLayer(
  gapsByMode: Readonly<Record<string, readonly string[]>>,
  backend: KgBackend,
): GapLayer {
  const now = gapsByMode[backend] ?? [];
  if (now.length > 0) return { kind: 'now', ids: [...now] };
  const otherMode: KgBackend = backend === 'networkx' ? 'neo4j' : 'networkx';
  const other = gapsByMode[otherMode] ?? [];
  if (other.length > 0) return { kind: 'ifSwitch', ids: [...other], otherMode };
  return { kind: 'none' };
}

export interface KgMigrationGate {
  /** 條件達成：Standard 態 · KG 後端為 Neo4j。達成後旗標換「即時生效」。 */
  met: boolean;
  /** 能不能按下去：門檻達成且沒有遷移正在進行。 */
  canRun: boolean;
}

export function kgMigrationGate(opts: {
  isStandard: boolean;
  backend: KgBackend;
  busy: boolean;
}): KgMigrationGate {
  const met = opts.isStandard && opts.backend === 'neo4j';
  return { met, canRun: met && !opts.busy };
}

export type DeployMode = 'lightweight' | 'standard';

/** 部署雙卡的角標：「（目前）」跟著實際 DEPLOY_MODE，「預覽中」跟著選中框。
 *  兩者可以不一致——不一致時選中的那張掛「預覽中」自證身分。 */
export function deployBadges(
  card: DeployMode,
  selected: DeployMode,
  actual: DeployMode,
): { current: boolean; previewing: boolean } {
  return { current: card === actual, previewing: card === selected && selected !== actual };
}

/** LLM 狀態列的值為 `(none)`（或空）時用 muted。 */
export function isUnsetValue(v: string | null | undefined): boolean {
  return v == null || v.trim() === '' || v.trim() === '(none)';
}
