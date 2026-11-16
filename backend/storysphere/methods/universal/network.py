"""CH4 `character.network`：角色分成哪些陣營（docs/spec/03 §4.1）。

hybrid。分群是純圖運算（沿用舊 `faction_service.detect_factions`：networkx 的
`greedy_modularity_communities`，resolution 1.0，成員少於 2 的社群不算派系）；派系命名是可選的 LLM 步驟，
失敗或放棄時用不需 LLM 的預設名稱，不影響分群結果。

- 讀 `relation_state` 與 `utterance`（宣告裡沒有 `character`）。「角色」＝出現在這兩種證據裡的 id：
  關係狀態的 source／target、話語的 speaker／addressees。讀不到角色種類（人、群體、動物）也讀不到名字，
  所以：角色數 < `MIN_CHARACTERS` 時不產出；成員名稱改從證據 `summary` 的固定格式
  （`A → B（type）…`、`A：話語…`，入庫 S2 寫的）取，取不到就用 `C<序號>`。
- 圖：正向關係（ally、family、friendship、member_of、romance）每筆加權重（同一對的多筆相加，同舊版）；
  對話共現邊＝speaker 與每個 addressee 之間，每句 `DIALOGUE_EDGE_WEIGHT`。
  兩人之間有 enemy 關係、又沒有任何正向關係時，不加對話共現邊（否則敵對的雙方會因為對話被分在一起）。
  enemy 關係不進分群圖，只算派系之間的 rivalry。
- 確定性：節點與邊都排序後才加進圖、結果也排序；greedy modularity 沒有隨機性。
- 中心度：分群圖上的 degree centrality（不重複鄰居數 / (n-1)），所有角色都有值（孤立者 0）。
- `inter_faction`：兩派之間的正向邊權重（cooperation）與 enemy 權重（rivalry），除以兩派人數乘積、上限 1（同舊版）。
- 一次執行只有一筆 `relation_network` 草稿；`derived_from`＝讀到的所有 relation_state 與 utterance。
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from storysphere.ingest.language_detection import get_language_display_name
from storysphere.llm.prompts import load_prompt
from storysphere.methods.base import MethodBase, Precheck, RunContext, ScopeItem
from storysphere.methods.reader import EvidenceView
from storysphere.methods.universal._llm import ainvoke_json, book_language, items_of
from storysphere.registry.models import MethodDecl
from storysphere.store.evidence_writer import EvidenceDraft

logger = logging.getLogger(__name__)

PROMPT_NAME = "methods/CH4"
MIN_CHARACTERS = 3
MIN_FACTION_SIZE = 2
RESOLUTION = 1.0
POSITIVE_TYPES = frozenset({"ally", "family", "friendship", "member_of", "romance"})
ENEMY_TYPES = frozenset({"enemy"})
DIALOGUE_EDGE_WEIGHT = 0.1
CONFIDENCE = 0.8
# 給命名 LLM 的上限
NAMING_MEMBERS = 12
NAMING_RELATIONS = 3
NAMING_DESC_CHARS = 200
MAX_LABEL_CHARS = 40

Pair = tuple[str, str]

_TEXT = {
    "zh": {
        "default_label": "{name}一派",
        "numbered_label": "派系 {n}",
        "summary": "角色網路：{people} 個角色分成 {n} 個派系",
        "summary_none": "角色網路：{people} 個角色，沒有可分出的派系",
    },
    "en": {
        "default_label": "{name}'s circle",
        "numbered_label": "Faction {n}",
        "summary": "Character network: {people} characters in {n} factions",
        "summary_none": "Character network: {people} characters, no factions found",
    },
}

_RELATION_SUMMARY_RE = re.compile(r"^(.+?) → (.+?)（")
_UTTERANCE_SUMMARY_RE = re.compile(r"^(.+?)：")


def pair_of(a: str, b: str) -> Pair:
    return (a, b) if a <= b else (b, a)


@dataclass(frozen=True)
class FactionResult:
    id: str
    member_ids: tuple[str, ...]  # 排序
    top_member: str  # 中心度最高（同分取 id 最小）


@dataclass(frozen=True)
class InterFaction:
    a: str
    b: str
    cooperation: float
    rivalry: float


@dataclass
class NetworkResult:
    factions: list[FactionResult] = field(default_factory=list)
    inter_faction: list[InterFaction] = field(default_factory=list)
    centrality: dict[str, float] = field(default_factory=dict)
    modularity: float | None = None
    # 圖上每條邊的權重（命名時挑「內部最強的關係」用）
    edges: dict[Pair, float] = field(default_factory=dict)


def collect_pairs(
    relations: Sequence[EvidenceView], utterances: Sequence[EvidenceView]
) -> tuple[set[str], dict[Pair, float], dict[Pair, float], dict[Pair, int]]:
    """(角色 id, 正向關係權重, enemy 權重, 對話次數)；對話次數依 speaker–addressee 的不重複一對計。"""
    nodes: set[str] = set()
    positive: dict[Pair, float] = {}
    enemy: dict[Pair, float] = {}
    dialogue: dict[Pair, int] = {}
    for r in relations:
        a, b = r.content.get("source_id"), r.content.get("target_id")
        if not a or not b:
            continue
        nodes.update((a, b))
        if a == b:
            continue
        weight = float(r.content.get("weight") if r.content.get("weight") is not None else 1.0)
        kind = r.content.get("relation_type")
        if kind in POSITIVE_TYPES:
            positive[pair_of(a, b)] = positive.get(pair_of(a, b), 0.0) + weight
        elif kind in ENEMY_TYPES:
            enemy[pair_of(a, b)] = enemy.get(pair_of(a, b), 0.0) + weight
    for u in utterances:
        speaker = u.content.get("speaker_id")
        if not speaker:
            continue
        nodes.add(speaker)
        for addressee in u.content.get("addressee_ids") or []:
            nodes.add(addressee)
            if addressee != speaker:
                dialogue[pair_of(speaker, addressee)] = dialogue.get(pair_of(speaker, addressee), 0) + 1
    return nodes, positive, enemy, dialogue


def analyze_network(
    nodes: Iterable[str],
    positive: dict[Pair, float],
    enemy: dict[Pair, float],
    dialogue: dict[Pair, int],
) -> NetworkResult:
    """Pure graph computation; the same input always gives the same output."""
    node_list = sorted(set(nodes))
    weights: dict[Pair, float] = {}
    for pair, w in positive.items():
        weights[pair] = w
    for pair, count in dialogue.items():
        if pair in enemy and pair not in positive:
            continue
        weights[pair] = weights.get(pair, 0.0) + DIALOGUE_EDGE_WEIGHT * count
    weights = {p: round(w, 6) for p, w in sorted(weights.items()) if w > 0}

    g: nx.Graph = nx.Graph()
    g.add_nodes_from(node_list)
    for (a, b), w in weights.items():
        g.add_edge(a, b, weight=w)

    result = NetworkResult(edges=weights)
    n = len(node_list)
    degree = nx.degree_centrality(g) if n > 1 else {}
    result.centrality = {c: round(float(degree.get(c, 0.0)), 4) for c in node_list}
    if g.number_of_edges() == 0:
        return result

    communities = [
        sorted(c)
        for c in nx.algorithms.community.greedy_modularity_communities(
            g, weight="weight", resolution=RESOLUTION
        )
    ]
    result.modularity = round(float(nx.algorithms.community.modularity(g, communities, weight="weight")), 4)
    big = sorted((c for c in communities if len(c) >= MIN_FACTION_SIZE), key=lambda c: (-len(c), c[0]))
    for i, members in enumerate(big, start=1):
        top = max(members, key=lambda c: (result.centrality[c], -node_list.index(c)))
        result.factions.append(FactionResult(f"F{i}", tuple(members), top))

    faction_of = {c: f.id for f in result.factions for c in f.member_ids}
    size = {f.id: len(f.member_ids) for f in result.factions}
    coop: dict[Pair, float] = {}
    riv: dict[Pair, float] = {}
    for (a, b), w in weights.items():
        fa, fb = faction_of.get(a), faction_of.get(b)
        if fa and fb and fa != fb:
            key = pair_of(fa, fb)
            coop[key] = coop.get(key, 0.0) + w
    for (a, b), w in enemy.items():
        fa, fb = faction_of.get(a), faction_of.get(b)
        if fa and fb and fa != fb:
            key = pair_of(fa, fb)
            riv[key] = riv.get(key, 0.0) + w

    def norm(value: float, key: Pair) -> float:
        return round(min(value / (size[key[0]] * size[key[1]]), 1.0), 3)

    result.inter_faction = [
        InterFaction(k[0], k[1], norm(coop.get(k, 0.0), k), norm(riv.get(k, 0.0), k))
        for k in sorted(set(coop) | set(riv), key=lambda k: (int(k[0][1:]), int(k[1][1:])))
    ]
    return result


def member_names(relations: Sequence[EvidenceView], utterances: Sequence[EvidenceView]) -> dict[str, str]:
    """角色 id → 名稱，只從證據 `summary` 的固定格式取（沒讀 `character`）；取不到的不在表裡。"""
    names: dict[str, str] = {}
    for r in relations:
        m = _RELATION_SUMMARY_RE.match(r.summary or "")
        if m:
            names.setdefault(str(r.content.get("source_id")), m.group(1).strip())
            names.setdefault(str(r.content.get("target_id")), m.group(2).strip())
    for u in utterances:
        m = _UTTERANCE_SUMMARY_RE.match(u.summary or "")
        if m:
            names.setdefault(str(u.content.get("speaker_id")), m.group(1).strip())
    return names


def default_labels(
    result: NetworkResult, display: dict[str, str], lang: dict[str, str]
) -> dict[str, str]:
    labels = {}
    for i, f in enumerate(result.factions, start=1):
        top = display.get(f.top_member)
        labels[f.id] = (
            lang["default_label"].format(name=top) if top else lang["numbered_label"].format(n=i)
        )
    return labels


def parse_labels(value: Any, faction_ids: set[str]) -> tuple[dict[str, str], dict[str, str]]:
    """(faction id → label, faction id → summary)；不認得的 faction_id、空的或過長的名稱略過。"""
    labels: dict[str, str] = {}
    summaries: dict[str, str] = {}
    for item in items_of(value):
        if not isinstance(item, dict) or item.get("faction_id") not in faction_ids:
            continue
        label = str(item.get("label") or "").strip()
        if label and len(label) <= MAX_LABEL_CHARS:
            labels.setdefault(item["faction_id"], label)
            summaries.setdefault(item["faction_id"], str(item.get("summary") or "").strip())
    return labels, summaries


class CharacterNetwork(MethodBase):
    def __init__(self, decl: MethodDecl) -> None:
        super().__init__(decl)
        self.prompt_version = load_prompt(PROMPT_NAME).version

    async def check(self, ctx: RunContext, item: ScopeItem) -> Precheck:
        relations = await ctx.evidence.list("relation_state")
        utterances = await ctx.evidence.list("utterance")
        nodes, *_ = collect_pairs(relations, utterances)
        if len(nodes) >= MIN_CHARACTERS:
            return Precheck.passed()
        return Precheck.unmet(
            [f"至少 {MIN_CHARACTERS} 個出現在關係或對話裡的角色（目前 {len(nodes)} 個）"],
            "入庫要抽到更多角色之間的關係狀態或對話",
            "角色少於 3 個時沒有可分的陣營，補資料也不會改變",
        )

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        relations = await ctx.evidence.list("relation_state")
        utterances = await ctx.evidence.list("utterance")
        nodes, positive, enemy, dialogue = collect_pairs(relations, utterances)
        result = analyze_network(nodes, positive, enemy, dialogue)

        texts = [str(r.content.get("description") or "") for r in relations[:5]] + [
            str(u.content.get("text") or "")[:100] for u in utterances[:5]
        ]
        lang_code = book_language([t for t in texts if t])
        lang = _TEXT["zh" if lang_code.lower().startswith("zh") else "en"]

        names = member_names(relations, utterances)
        order = {c: i for i, c in enumerate(sorted(nodes), start=1)}
        display = {c: names.get(c) or f"C{order[c]}" for c in nodes}
        labels = default_labels(result, names, lang)
        naming, faction_summaries = "skipped", {}
        if result.factions:
            naming = "failed"
            try:
                named, faction_summaries = await self._name(
                    ctx, result, relations, display, get_language_display_name(lang_code)
                )
                naming = "done" if named else "abstained"
                labels.update(named)
            except Exception as exc:  # 命名是可選步驟：任何失敗都不影響分群結果
                logger.warning("CH4 faction naming failed: %s", exc)
                ctx.summary["naming_error"] = type(exc).__name__

        content = {
            "factions": [
                {"id": f.id, "label": labels[f.id], "member_ids": list(f.member_ids)}
                for f in result.factions
            ],
            "inter_faction": [
                {"a": r.a, "b": r.b, "cooperation": r.cooperation, "rivalry": r.rivalry}
                for r in result.inter_faction
            ],
            "centrality": result.centrality,
            "modularity": result.modularity,
        }
        ctx.summary.update(
            {
                "character_count": len(nodes),
                "edge_count": len(result.edges),
                "faction_count": len(result.factions),
                "naming": naming,
                "faction_summaries": faction_summaries,
            }
        )
        template = lang["summary"] if result.factions else lang["summary_none"]
        return [
            EvidenceDraft(
                claim_type="relation_network",
                summary=template.format(people=len(nodes), n=len(result.factions)),
                confidence=CONFIDENCE,
                content=content,
                derived_from=[*(r.id for r in relations), *(u.id for u in utterances)],
            )
        ]

    async def _name(
        self,
        ctx: RunContext,
        result: NetworkResult,
        relations: Sequence[EvidenceView],
        display: dict[str, str],
        language_name: str,
    ) -> tuple[dict[str, str], dict[str, str]]:
        """問模型每個派系叫什麼；回傳 (faction id → 名稱, faction id → 一句話)。"""
        by_pair: dict[Pair, EvidenceView] = {}
        for r in relations:
            if r.content.get("relation_type") not in POSITIVE_TYPES:
                continue
            a, b = r.content.get("source_id"), r.content.get("target_id")
            if not a or not b or a == b:
                continue
            best = by_pair.get(pair_of(a, b))
            if best is None or float(r.content.get("weight") or 0) > float(best.content.get("weight") or 0):
                by_pair[pair_of(a, b)] = r
        rows = []
        for f in result.factions:
            members = set(f.member_ids)
            inside = sorted(
                (
                    (w, p) for p, w in result.edges.items()
                    if p[0] in members and p[1] in members and p in by_pair
                ),
                key=lambda x: (-x[0], x[1]),
            )[:NAMING_RELATIONS]
            ranked = sorted(f.member_ids, key=lambda c: (-result.centrality[c], c))[:NAMING_MEMBERS]
            rows.append(
                json.dumps(
                    {
                        "faction_id": f.id,
                        "members": [display[c] for c in ranked],
                        "strongest_relations": [
                            str(by_pair[p].content.get("description") or by_pair[p].summary)[:NAMING_DESC_CHARS]
                            for _, p in inside
                        ],
                    },
                    ensure_ascii=False,
                )
            )
        system, user = load_prompt(PROMPT_NAME).render(
            language_name=language_name, factions="\n".join(rows)
        )
        ids = {f.id for f in result.factions}
        return await ainvoke_json(
            ctx.llm(), system, user, lambda value: parse_labels(value, ids), label="CH4 naming"
        )
