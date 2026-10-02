import type {
  CategoryDescriptor,
  Framework,
  FrameworkCategory,
  FrameworkItem,
} from '@/data/frameworksData';

/** rail 搜尋字串正規化：去頭尾空白、不分大小寫。 */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 搜尋同時比對方法名、底下每個 item 名、分類名（空字串＝全部命中）。 */
export function matchFramework(fw: Framework, q: string): boolean {
  if (!q) return true;
  return (
    fw.name.toLowerCase().includes(q) ||
    fw.category.toLowerCase().includes(q) ||
    fw.items.some((it) => it.name.toLowerCase().includes(q))
  );
}

export interface RailGroup {
  readonly category: CategoryDescriptor;
  readonly frameworks: Framework[];
}

/** 依分類分組；沒有任何命中的分類整組省略（標頭也不會出現）。 */
export function buildRailGroups(
  frameworks: Framework[],
  categories: CategoryDescriptor[],
  query: string,
): RailGroup[] {
  const q = normalizeQuery(query);
  const hits = frameworks.filter((fw) => matchFramework(fw, q));
  return categories
    .map((category) => ({
      category,
      frameworks: hits.filter((fw) => fw.categoryId === category.id),
    }))
    .filter((g) => g.frameworks.length > 0);
}

/** 規模數字（「12 類型」「5 步驟」…）。 */
export function scaleLabel(fw: Framework): string {
  return `${fw.items.length} ${fw.itemLabel}`;
}

/** 某分類的第一個方法（點分類卡的跳轉目標）。 */
export function firstOfCategory(
  frameworks: Framework[],
  id: FrameworkCategory,
): Framework | undefined {
  return frameworks.find((fw) => fw.categoryId === id);
}

export interface BadgeGroup {
  /** badge 首詞（「女性 · 反派」→「女性」；en「Female · Antagonist」→「Female」）。 */
  readonly label: string;
  /** n 為資料原序的序號（1 起算），分組後不重編。 */
  readonly entries: { item: FrameworkItem; n: number }[];
}

/** 依 badge 首詞分組：組序為首次出現順序，組內保留資料原序與原序號；無 badge 的 item 不入組。 */
export function groupItemsByBadge(items: FrameworkItem[]): BadgeGroup[] {
  const groups = new Map<string, BadgeGroup['entries']>();
  items.forEach((item, i) => {
    if (!item.badge) return;
    const label = item.badge.split('·')[0].trim();
    if (!label) return;
    const entries = groups.get(label) ?? [];
    entries.push({ item, n: i + 1 });
    groups.set(label, entries);
  });
  return [...groups].map(([label, entries]) => ({ label, entries }));
}
