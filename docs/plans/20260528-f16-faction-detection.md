# F-16 角色派系偵測（Faction Detection）實作計畫

## Context

StorySphere 的 KG 已有豐富的角色關係邊（ALLY、ENEMY、FAMILY 等），但沒有「群體結構」視圖。
- 圖譜頁工具列的「社群」按鈕目前 `disabled: true`，`byCommunity()` 拋出佔位錯誤
- 前端 `ClusterOverviewPanel` 已有 overview ↔ drill-in 兩層架構，只差填入派系資料
- `LinkPredictionService` 示範了「KGService 取圖 → 無向視圖 → NetworkX 演算法」的模式
- `greedy_modularity_communities` 是 NetworkX 內建，無需新套件

目標：解除「社群」模式的 disabled，讓 KG 頁直接呈現派系聚類視覺 + 派系間關係矩陣，
不新增獨立頁面——所有派系資訊都在 `ClusterOverviewPanel` 內完成。

---

## 演算法設計

### 輸入
- **正向關係**（納入社群偵測圖）：ALLY、FAMILY、FRIENDSHIP、MEMBER_OF、ROMANCE → 加權邊
- **敵對關係**（排除但另行記錄）：ENEMY → 計算跨派系 rivalry
- **刻意排除**：SUBORDINATE（上下屬不必然同派系，例如敵營細作、跨組織臣屬）、LOCATED_IN / OWNS / OTHER（非人際情感連結）
- 節點限縮：只取 `EntityType.CHARACTER`

### 演算法
```python
g = nx.Graph()
# 以正向邊建無向加權圖
communities = nx.algorithms.community.greedy_modularity_communities(g, weight='weight')
# 單節點 community → unaffiliated；≥ 2 節點 → Faction
```

### 輸出結構
```
Faction: id, label ("Faction 1"...), member_ids, cohesion_score, top_member_names[3]
FactionRelation: source_faction_id, target_faction_id, cooperation(0-1), rivalry(0-1)
FactionAnalysis: book_id, chapter?, factions[], relations[], unaffiliated_entity_ids[], unaffiliated_names[]
```

**Cohesion** = 派系內部邊總權重 / 節點數  
**Cooperation / Rivalry** = 跨派系邊權重和 / (|fa| × |fb|)（正規化為 [0,1]）

---

## 修改範圍

### 後端（新增檔案）

| 檔案 | 說明 |
|------|------|
| `src/storysphere/domain/faction.py` | `Faction`、`FactionRelation`、`FactionAnalysis` Pydantic models（snake_case） |
| `src/storysphere/services/faction_service.py` | `FactionService.detect_factions(book_id, chapter?)` — 純圖計算，無 LLM |
| `src/storysphere/api/schemas/factions.py` | `FactionAnalysisResponse`（camelCase via `alias_generator=to_camel`） |
| `src/storysphere/api/routers/factions.py` | `GET /books/{book_id}/analysis/factions?chapter=<int>` |

### 後端（修改檔案）

| 檔案 | 修改項 |
|------|--------|
| `src/storysphere/api/deps.py` | 新增 `get_faction_service()` (`@lru_cache(maxsize=1)`)、`FactionServiceDep` |
| `src/storysphere/api/main.py` | import `factions` router + `app.include_router(factions.router, prefix=prefix)` |

### 前端（新增檔案）

| 檔案 | 說明 |
|------|------|
| `frontend/src/api/factions.ts` | `fetchFactionAnalysis(bookId, chapter?)` |

### 前端（修改檔案）

| 檔案 | 修改項 |
|------|--------|
| `frontend/src/services/kgClustering.ts` | `SuperNode.clusterType` 改為 `EntityType \| string`；新增 `SuperNode.label?: string`；`AggregatedEdge.isRivalry?: boolean`；實作 `byCommunity(graph, factionAnalysis)` |
| `frontend/src/lib/cytoscapeConfig.ts` | `toClusteredCytoscapeElements` 把 `AggregatedEdge.isRivalry` 寫入 element `data.isRivalry`；新增 community 模式 stylesheet selector `edge[?isRivalry]` |
| `frontend/src/components/graph/ClusterOverviewPanel.tsx` | 支援 faction label；dotKey 推導改為 `clusterMode === 'community'` 走 `FACTION_COLORS[index % N]`、其餘維持原邏輯；概覽層底部加入 N×N 派系關係矩陣 |
| `frontend/src/pages/GraphPage.tsx` | `clusterDrillIn` 型別 `EntityType \| null` → `string \| null`（連帶移除 `handleNodeTap` 內 `as EntityType` cast）；`clusteredGraph` useMemo 擴展 'community'；`showClusterOverview` 條件擴為 `(clusterMode === 'type' \|\| clusterMode === 'community')`；`breadcrumbItems` 中段 label 依 `clusterMode` 切 `v1.cluster.mode.type` / `v1.cluster.mode.community`；新增 `useQuery` 取 factionData（when mode==='community'） |
| `frontend/src/components/graph/GraphToolbar.tsx` | community 項目移除 `disabled: true` 和 `tooltipKey` |
| `frontend/src/i18n/locales/zh-TW/graph.json` | 移除 `communityDisabled`；新增 faction 相關鍵 |
| `frontend/src/i18n/locales/en/graph.json` | 同上英文版 |

---

## 詳細設計

### `src/storysphere/domain/faction.py`
```python
class Faction(BaseModel):
    id: str                       # "faction:0", "faction:1"...
    label: str                    # "Faction 1", "Faction 2"...
    member_ids: list[str]
    cohesion_score: float
    top_member_names: list[str]   # 最多 3 個，按 mention_count 降序

class FactionRelation(BaseModel):
    source_faction_id: str
    target_faction_id: str
    cooperation: float            # [0.0, 1.0]
    rivalry: float                # [0.0, 1.0]

class FactionAnalysis(BaseModel):
    book_id: str
    chapter: int | None = None
    factions: list[Faction]
    relations: list[FactionRelation]
    unaffiliated_entity_ids: list[str]
    unaffiliated_names: list[str]
```

### `src/storysphere/services/faction_service.py` 核心邏輯

```python
POSITIVE_TYPES = {RelationType.ALLY, RelationType.FAMILY,
                  RelationType.FRIENDSHIP, RelationType.MEMBER_OF, RelationType.ROMANCE}
ENEMY_TYPES = {RelationType.ENEMY}

class FactionService:
    def __init__(self, kg_service) -> None:
        self._kg = kg_service

    async def detect_factions(self, book_id: str, chapter: int | None = None) -> FactionAnalysis:
        # 1. 取角色與關係
        if chapter is not None:
            _, snap_entities, snap_relations = await self._kg.get_snapshot(book_id, "chapter", chapter)
            char_ids = {e.id for e in snap_entities if e.entity_type == EntityType.CHARACTER}
            entity_map = {e.id: e for e in snap_entities if e.id in char_ids}
            relations = snap_relations
        else:
            all_entities = await self._kg.list_entities(document_id=book_id)
            char_ids = {e.id for e in all_entities if e.entity_type == EntityType.CHARACTER}
            entity_map = {e.id: e for e in all_entities if e.id in char_ids}
            relations = await self._kg.list_relations(document_id=book_id)

        # 2. 建無向加權圖 + 收集敵對邊
        g = nx.Graph()
        for eid in char_ids:
            g.add_node(eid)
        enemy_edges: list[tuple[str, str, float]] = []
        for r in relations:
            if r.source_id not in char_ids or r.target_id not in char_ids:
                continue
            if r.relation_type in POSITIVE_TYPES:
                if g.has_edge(r.source_id, r.target_id):
                    g[r.source_id][r.target_id]['weight'] += r.weight
                else:
                    g.add_edge(r.source_id, r.target_id, weight=r.weight)
            elif r.relation_type in ENEMY_TYPES:
                enemy_edges.append((r.source_id, r.target_id, r.weight))

        # 3. 早退：無角色
        if not g.number_of_nodes():
            return FactionAnalysis(book_id=book_id, chapter=chapter,
                                   factions=[], relations=[],
                                   unaffiliated_entity_ids=[], unaffiliated_names=[])

        # 4. 社群偵測；單節點 → unaffiliated，≥2 → Faction
        communities = list(nx.algorithms.community.greedy_modularity_communities(g, weight='weight'))
        factions, unaffiliated_ids = [], []
        for i, community in enumerate(communities):
            if len(community) < 2:
                unaffiliated_ids.extend(community)
                continue
            intra_w = sum(g[u][v]['weight'] for u, v in g.edges() if u in community and v in community)
            members_sorted = sorted(community,
                key=lambda eid: entity_map[eid].mention_count if eid in entity_map else 0,
                reverse=True)
            factions.append(Faction(
                id=f"faction:{i}", label=f"Faction {i + 1}",
                member_ids=list(community),
                cohesion_score=round(intra_w / len(community), 3),
                top_member_names=[entity_map[e].name for e in members_sorted[:3] if e in entity_map],
            ))

        # 5. 跨派系 cooperation / rivalry，正規化為 [0,1]
        faction_of = {eid: f.id for f in factions for eid in f.member_ids}
        sizes = {f.id: len(f.member_ids) for f in factions}
        coop: dict[tuple, float] = {}
        riv:  dict[tuple, float] = {}
        for u, v, data in g.edges(data=True):
            fu, fv = faction_of.get(u), faction_of.get(v)
            if fu and fv and fu != fv:
                key = tuple(sorted([fu, fv]))
                coop[key] = coop.get(key, 0) + data.get('weight', 1)
        for u, v, w in enemy_edges:
            fu, fv = faction_of.get(u), faction_of.get(v)
            if fu and fv and fu != fv:
                key = tuple(sorted([fu, fv]))
                riv[key] = riv.get(key, 0) + w

        def _norm(val, k):
            denom = sizes.get(k[0], 1) * sizes.get(k[1], 1)
            return round(min(val / denom, 1.0), 3)

        faction_relations = [
            FactionRelation(source_faction_id=k[0], target_faction_id=k[1],
                            cooperation=_norm(coop.get(k, 0), k),
                            rivalry=_norm(riv.get(k, 0), k))
            for k in set(coop) | set(riv)
        ]
        return FactionAnalysis(
            book_id=book_id, chapter=chapter,
            factions=factions, relations=faction_relations,
            unaffiliated_entity_ids=unaffiliated_ids,
            unaffiliated_names=[entity_map[e].name for e in unaffiliated_ids if e in entity_map],
        )
```

### `src/storysphere/api/routers/factions.py`
```
GET /api/v1/books/{book_id}/analysis/factions?chapter=<int>
```
- 同步端點（純計算，無 background task）
- book 不存在 → 404（透過 KGService list_entities 回傳空集合判斷，或檢查 DocService）
- 回傳 `FactionAnalysisResponse`

### `frontend/src/services/kgClustering.ts` 介面擴充

```typescript
export interface SuperNode {
  id: string;
  kind: 'super';
  clusterType: EntityType | string;  // faction 模式用派系 ID
  count: number;
  memberIds: string[];
  topMembers: SuperNodeMember[];
  label?: string;                    // 新增：faction 名稱，覆蓋 i18n entityTypes key
}

export interface AggregatedEdge {
  id: string; source: string; target: string;
  weight: number; inferredCount: number;
  isRivalry?: boolean;               // 新增：敵對邊 → Cytoscape 紅色虛線 selector
}
```

**SuperNode ID 格式**（faction 模式）：`cluster:faction:0`、`cluster:faction:1`...  
（`isSuperNodeId()` 不需改動，`startsWith('cluster:')` 已涵蓋）

```typescript
// 新簽名：純同步 transform（GraphPage fetch factionData 再傳入）
export function byCommunity(graph: GraphData, factionAnalysis: FactionAnalysisResponse): ClusteredGraph
```

### `frontend/src/pages/GraphPage.tsx` 改動點

```typescript
// 1. clusterDrillIn 型別放寬（faction ID 是 string，不是 EntityType）
const [clusterDrillIn, setClusterDrillIn] = useState<string | null>(null);

// 2. 新增 factionData fetch（只在 community 模式下觸發）
const { data: factionData } = useQuery({
  queryKey: ['books', bookId, 'analysis', 'factions'],
  queryFn: () => fetchFactionAnalysis(bookId!),
  enabled: !!bookId && clusterMode === 'community',
});

// 3. 擴展 clusteredGraph（line 103-106 附近）
const clusteredGraph = useMemo(() => {
  if (clusterMode === 'node' || !data) return null;
  if (clusterMode === 'type') return byType(data);
  if (clusterMode === 'community' && factionData) return byCommunity(data, factionData);
  return null;
}, [clusterMode, data, factionData]);

// 4. handleNodeTap 內 super-node 點擊（line 168-173）移除型別 cast
if (sn) setClusterDrillIn(sn.clusterType);   // 原本: as EntityType

// 5. showClusterOverview 條件擴充（line 282）
const showClusterOverview =
  !showCompare &&
  !showInferredReview &&
  (clusterMode === 'type' || clusterMode === 'community') &&
  !selectedNode;

// 6. breadcrumbItems 中段 label 依模式切換（line 265）
const modeLabelKey =
  clusterMode === 'community' ? 'v1.cluster.mode.community' : 'v1.cluster.mode.type';
items.push({
  label: t(modeLabelKey),
  onClick: clusterDrillIn ? () => setClusterDrillIn(null) : undefined,
});
```

`ClusterOverviewPanel` 的 `onDrillIn` / `drillInType` props 型別從 `EntityType` 改為 `string`，`handleNodeTap` 對 super-node 的處理已用 `sn.clusterType`，型別放寬後自動相容（cast 移除如上 #4）。

### `frontend/src/components/graph/ClusterOverviewPanel.tsx` 改動

**概覽層（community 模式）**：
1. Faction 卡標題：`c.label ?? t(`entityTypes.${c.clusterType}`)`
2. 色點推導必須條件化：原本的 `dotKey` 三元判斷只對 `EntityType` 有意義；community 模式改走 `FACTION_COLORS[index % FACTION_COLORS.length]`（用現有 graph token 循環），不再走 `var(--entity-${dotKey}-dot)`
3. 卡內顯示 `topMembers` 名稱 + cohesion score
4. 概覽層底部新增「派系關係」區塊：N×N CSS grid，cell 顏色編碼 cooperation（暖色 opacity）+ rivalry（紅色 opacity）

**props 介面**：`drillInType` / `onDrillIn` 型別 `EntityType` → `string`（與 GraphPage.clusterDrillIn 一致）

**Drill-in 層**（與 type cluster 完全相同行為，只是 label 用 faction name）

### Cytoscape 敵對邊樣式（`frontend/src/lib/cytoscapeConfig.ts`）

兩處改動缺一不可：

1. **`toClusteredCytoscapeElements`** 把 `AggregatedEdge.isRivalry` 寫入 element `data`：
```ts
{ group: 'edges', data: { id, source, target, weight, inferredCount, isRivalry: e.isRivalry ?? false } }
```
2. stylesheet 新增 selector（community 模式生效）：
```js
{ selector: 'edge[?isRivalry]', style: { 'line-color': 'var(--color-error, #ef4444)', 'line-style': 'dashed' } }
```

未寫入 `data.isRivalry` 時 selector 永遠 match 不到，敵對邊樣式不會出現。

---

## API Contract 更新

`docs/API_CONTRACT.md` 新增：
```
GET /api/v1/books/{bookId}/analysis/factions
  Query: chapter (int, optional) — chapter snapshot
  Response: FactionAnalysisResponse (camelCase)
  Note: synchronous, no task polling needed
```

commit message 標註 `[api-contract updated]`。

---

## 測試計畫

### 後端（`tests/services/test_faction_service.py`）
- `test_no_characters_returns_empty` — 空書
- `test_two_allies_form_one_faction` — 2 個角色有 ALLY → 1 faction，cohesion > 0
- `test_isolated_character_is_unaffiliated` — 無邊角色 → unaffiliated_ids
- `test_enemy_edge_produces_rivalry` — ENEMY 邊 → FactionRelation.rivalry > 0
- `test_chapter_snapshot_respects_position` — chapter=1 只看第一章角色

### 後端（`tests/api/test_factions.py`）
- `test_returns_200_with_factions` — happy path
- `test_chapter_query_param_accepted` — ?chapter=3 → 200
- `test_unknown_book_returns_empty_factions`（book 存在但無角色）

### 前端驗證流程
1. 啟動前後端 → 圖譜頁點「社群」→ 不再 disabled，圖顯示派系 SuperNode
2. 點 SuperNode → drill-in 顯示成員列表
3. 回到概覽 → 底部矩陣顯示 cooperation / rivalry
4. 敵對關係書 → 紅色虛線邊出現
5. 切回「節點」模式 → 恢復一般視圖

---

## 執行順序

```
Phase 1（後端）：
  src/storysphere/domain/faction.py
  src/storysphere/services/faction_service.py
  src/storysphere/api/schemas/factions.py
  src/storysphere/api/routers/factions.py
  src/storysphere/api/deps.py + src/storysphere/api/main.py
  npm run gen:types
  tests/

Phase 2（前端 KG 頁）：
  frontend/src/api/factions.ts
  frontend/src/services/kgClustering.ts（byCommunity + 介面擴充）
  frontend/src/lib/cytoscapeConfig.ts（isRivalry selector）
  frontend/src/components/graph/ClusterOverviewPanel.tsx
  frontend/src/pages/GraphPage.tsx
  frontend/src/components/graph/GraphToolbar.tsx（remove disabled）
  i18n graph.json 更新
  docs/API_CONTRACT.md + docs/plans/ 存檔
```
