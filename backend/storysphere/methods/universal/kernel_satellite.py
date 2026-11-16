"""EV1 `event.kernel_satellite`：核心事件與衛星事件（docs/spec/03 §4.1）。

hybrid：先用因果圖機械分類，明確的直接判，邊界的才交 LLM（每個邊界事件一次呼叫，
只給該事件、它的因果鄰居與前後事件的摘要，不給全文）。

機械分類（圖由現行 `causal_link` 建立；指向不存在事件的連結、自指的連結忽略，重複的對只算一條）：
- 有環時：依 `text_rank`（同分依 id）決定走訪順序，做一次迭代式 DFS，指向「目前走訪路徑上的節點」的邊
  視為回邊並去掉，剩下的是 DAG。走訪順序固定，所以結果確定；不會無限迴圈。
- 出度／入度用原圖（去重後）的不重複鄰居數；「最長因果鏈」用去掉回邊後的 DAG 算，
  凡是在任一條最長路徑上的事件都算「在鏈上」（不需要選一條）。最長路徑少於 `MIN_CHAIN_NODES` 個事件時
  視為沒有鏈。
- 明確 kernel：在最長鏈上，或出度 ≥ `KERNEL_OUT_DEGREE`。
- 明確 satellite：出度 0、入度 ≤ 1、不在鏈上（孤立或只是某件事的末端結果）。
- 其餘是邊界（出度 1–2 不在鏈上、或出度 0 但有 ≥ 2 個成因匯入），交 LLM；圖的初判
  `graph_hint` 是「出度＋入度 ≥ 3 → kernel，否則 satellite」，模型可以推翻。
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from storysphere.ingest.language_detection import get_language_display_name
from storysphere.llm.prompts import load_prompt
from storysphere.methods.base import MethodBase, Precheck, RunContext, ScopeItem
from storysphere.methods.reader import EvidenceView
from storysphere.methods.universal._llm import (
    LLM_CONCURRENCY,
    LlmOutputError,
    ainvoke_json,
    book_language,
    clamp_unit,
    gather_limited,
    items_of,
)
from storysphere.registry.models import MethodDecl
from storysphere.store.evidence_writer import EvidenceDraft

PROMPT_NAME = "methods/EV1"
KERNEL_OUT_DEGREE = 3
SATELLITE_MAX_IN_DEGREE = 1
MIN_CHAIN_NODES = 3
HINT_DEGREE_SUM = 3
ADJACENT = 2  # 前後各幾個事件
MECHANICAL_CONFIDENCE = 0.8
FALLBACK_CONFIDENCE = 0.4  # 模型放棄判斷，沿用圖的初判時
WEIGHTS = ("kernel", "satellite")

_TEXT = {
    "zh": {
        "kernel_chain": "在最長因果鏈上，拿掉它因果鏈會斷開。",
        "kernel_degree": "它直接導致 {n} 個後續事件，是情節的樞紐。",
        "satellite": "它{tail}，拿掉它故事的因果主線不受影響。",
        "tail_isolated": "沒有與其他事件的因果連結",
        "tail_leaf": "只是前面事件的末端結果",
        "fallback": "模型未能判斷，沿用因果圖的初判。",
        "summary_kernel": "核心事件",
        "summary_satellite": "衛星事件",
    },
    "en": {
        "kernel_chain": "It lies on the longest causal chain; removing it breaks the chain.",
        "kernel_degree": "It directly causes {n} later events and is a hinge of the plot.",
        "satellite": "It {tail}; removing it leaves the main causal line intact.",
        "tail_isolated": "has no causal links to other events",
        "tail_leaf": "is only a terminal consequence of earlier events",
        "fallback": "The model could not decide; the causal graph's first guess is used.",
        "summary_kernel": "Kernel event",
        "summary_satellite": "Satellite event",
    },
}


@dataclass
class Graph:
    """The causal graph over events, as event evidence ids."""

    out: dict[str, set[str]]
    inc: dict[str, set[str]]
    chain: set[str]  # 在任一條最長因果鏈上的事件
    chain_length: int
    removed_back_edges: int


def build_graph(
    event_ids: list[str], pairs: list[tuple[str, str]], rank: dict[str, int]
) -> Graph:
    """Degrees from the deduplicated pairs; longest chain on the DAG left after dropping back edges."""
    known = set(event_ids)
    out: dict[str, set[str]] = {e: set() for e in event_ids}
    inc: dict[str, set[str]] = {e: set() for e in event_ids}
    for cause, effect in pairs:
        if cause in known and effect in known and cause != effect:
            out[cause].add(effect)
            inc[effect].add(cause)

    order = sorted(event_ids, key=lambda e: (rank[e], e))

    def key(e: str) -> tuple[int, str]:
        return rank[e], e

    # 迭代式 DFS 找回邊（指向目前路徑上的節點的邊）
    dag: dict[str, list[str]] = {e: [] for e in event_ids}
    state: dict[str, int] = {}  # 1 = 在路徑上，2 = 已完成
    removed = 0
    for root in order:
        if root in state:
            continue
        state[root] = 1
        stack = [(root, iter(sorted(out[root], key=key)))]
        while stack:
            node, children = stack[-1]
            advanced = False
            for child in children:
                if state.get(child) == 1:
                    removed += 1
                    continue
                dag[node].append(child)
                if child not in state:
                    state[child] = 1
                    stack.append((child, iter(sorted(out[child], key=key))))
                    advanced = True
                    break
            if not advanced:
                state[node] = 2
                stack.pop()

    # DAG 上的最長路徑（以節點數計）：from_start[e]＝以 e 結尾的最長、to_end[e]＝以 e 開頭的最長
    topo: list[str] = []
    indegree = dict.fromkeys(event_ids, 0)
    for node in event_ids:
        for child in dag[node]:
            indegree[child] += 1
    ready = sorted((e for e in event_ids if indegree[e] == 0), key=key)
    while ready:
        node = ready.pop(0)
        topo.append(node)
        for child in dag[node]:
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
        ready.sort(key=key)
    from_start = dict.fromkeys(event_ids, 1)
    for node in topo:
        for child in dag[node]:
            from_start[child] = max(from_start[child], from_start[node] + 1)
    to_end = dict.fromkeys(event_ids, 1)
    for node in reversed(topo):
        for child in dag[node]:
            to_end[node] = max(to_end[node], to_end[child] + 1)
    length = max(from_start.values(), default=0)
    chain = (
        {e for e in event_ids if from_start[e] + to_end[e] - 1 == length}
        if length >= MIN_CHAIN_NODES
        else set()
    )
    return Graph(out, inc, chain, length, removed)


@dataclass(frozen=True)
class Verdict:
    """機械分類的結果：`weight` 為 None 表示邊界，要交 LLM。"""

    weight: str | None
    reason: str  # kernel_chain / kernel_degree / satellite_isolated / satellite_leaf / boundary
    hint: str


def classify(graph: Graph, event_id: str) -> Verdict:
    out_degree, in_degree = len(graph.out[event_id]), len(graph.inc[event_id])
    on_chain = event_id in graph.chain
    hint = "kernel" if out_degree + in_degree >= HINT_DEGREE_SUM else "satellite"
    if on_chain:
        return Verdict("kernel", "kernel_chain", "kernel")
    if out_degree >= KERNEL_OUT_DEGREE:
        return Verdict("kernel", "kernel_degree", "kernel")
    if out_degree == 0 and in_degree <= SATELLITE_MAX_IN_DEGREE:
        return Verdict("satellite", "satellite_isolated" if in_degree == 0 else "satellite_leaf", "satellite")
    return Verdict(None, "boundary", hint)


def _pairs(links: list[EvidenceView]) -> list[tuple[str, str]]:
    return [(link.content.get("cause_event_id"), link.content.get("effect_event_id")) for link in links]


def _lang_key(language_code: str) -> str:
    return "zh" if language_code.lower().startswith("zh") else "en"


def _event_brief(code: str, view: EvidenceView) -> dict[str, Any]:
    c = view.content
    return {"id": code, "chapter": c.get("chapter"), "title": c.get("title"),
            "description": c.get("description")}


def parse_verdict(value: Any, target_code: str) -> dict[str, Any] | None:
    """The answer for the target event; None if the model abstained.

    Items about other events are ignored. An invalid weight, or an answer that talks only about
    other events, raises `LlmOutputError` (→ retry).
    """
    items = items_of(value)
    if not items and isinstance(value, dict) and value.get("abstain_reason"):
        return None
    mine = [i for i in items if isinstance(i, dict) and i.get("event_id") == target_code]
    if not mine:
        raise LlmOutputError(f"no item for the target event {target_code}")
    item = mine[0]
    if item.get("weight") not in WEIGHTS:
        raise LlmOutputError(f"invalid weight {item.get('weight')!r}")
    return item


class KernelSatellite(MethodBase):
    def __init__(self, decl: MethodDecl) -> None:
        super().__init__(decl)
        self.prompt_version = load_prompt(PROMPT_NAME).version

    async def check(self, ctx: RunContext, item: ScopeItem) -> Precheck:
        if await ctx.evidence.count("causal_link") > 0:
            return Precheck.passed()
        return Precheck.unmet(
            ["causal_link"],
            "先執行 EV2（event.causal_network）產生事件之間的因果連結",
            "若 EV2 已執行過但沒有產出任何連結（事件之間沒有可辨認的因果），重跑也不會有結果",
        )

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        views = await ctx.evidence.list("event")
        views.sort(key=lambda v: (int(v.content.get("text_rank") or 0), v.id))
        links = await ctx.evidence.list("causal_link")
        codes = {v.id: f"E{i}" for i, v in enumerate(views, start=1)}
        by_id = {v.id: v for v in views}
        rank = {v.id: int(v.content.get("text_rank") or 0) for v in views}
        graph = build_graph([v.id for v in views], _pairs(links), rank)
        # 只留兩端都是現行事件的連結；同一對有多條連結時各自保留（都算判斷依據）
        links = [
            link for link in links
            if link.content.get("cause_event_id") in by_id and link.content.get("effect_event_id") in by_id
            and link.content.get("cause_event_id") != link.content.get("effect_event_id")
        ]
        link_codes = {link.id: f"L{i}" for i, link in enumerate(links, start=1)}
        links_in: dict[str, list[EvidenceView]] = {v.id: [] for v in views}
        links_out: dict[str, list[EvidenceView]] = {v.id: [] for v in views}
        for link in links:
            links_out[link.content["cause_event_id"]].append(link)
            links_in[link.content["effect_event_id"]].append(link)

        lang_code = book_language([str(v.content.get("description") or "") for v in views[:5]])
        lang = _TEXT[_lang_key(lang_code)]
        verdicts = {v.id: classify(graph, v.id) for v in views}
        boundary = [v for v in views if verdicts[v.id].weight is None]

        prompt = load_prompt(PROMPT_NAME)
        language = get_language_display_name(lang_code)
        llm = ctx.llm() if boundary else None
        index_of = {v.id: i for i, v in enumerate(views)}

        def boundary_call(view: EvidenceView) -> Callable[[], Awaitable[dict[str, Any] | None]]:
            code = codes[view.id]
            i = index_of[view.id]
            near = views[max(0, i - ADJACENT): i] + views[i + 1: i + 1 + ADJACENT]
            system, user = prompt.render(
                language_name=language,
                target_event=json.dumps(
                    {**_event_brief(code, view), "significance": view.content.get("significance")},
                    ensure_ascii=False,
                ),
                causal_in=_link_lines(links_in[view.id], link_codes, codes, by_id, "cause_event_id"),
                causal_out=_link_lines(links_out[view.id], link_codes, codes, by_id, "effect_event_id"),
                graph_hint=json.dumps(
                    {
                        "out_degree": len(graph.out[view.id]),
                        "in_degree": len(graph.inc[view.id]),
                        "on_longest_chain": view.id in graph.chain,
                        "hint": verdicts[view.id].hint,
                    }
                ),
                adjacent_events="\n".join(
                    json.dumps(_event_brief(codes[n.id], n), ensure_ascii=False) for n in near
                ),
            )
            return lambda: ainvoke_json(
                llm, system, user, lambda value: parse_verdict(value, code), label=f"EV1 {code}"
            )

        # 結果依邊界事件的順序對應回去，與完成先後無關
        answers = await gather_limited([boundary_call(v) for v in boundary], LLM_CONCURRENCY)
        llm_answers = {v.id: a for v, a in zip(boundary, answers, strict=True)}

        drafts: list[EvidenceDraft] = []
        mechanical = llm_judged = fallback = 0
        for view in views:
            verdict = verdicts[view.id]
            related = links_in[view.id] + links_out[view.id]
            derived = [view.id, *(link.id for link in related)]
            if verdict.weight is not None:
                mechanical += 1
                weight, confidence = verdict.weight, MECHANICAL_CONFIDENCE
                if verdict.reason == "kernel_chain":
                    rationale = lang["kernel_chain"]
                elif verdict.reason == "kernel_degree":
                    rationale = lang["kernel_degree"].format(n=len(graph.out[view.id]))
                else:
                    tail = lang["tail_isolated" if verdict.reason == "satellite_isolated" else "tail_leaf"]
                    rationale = lang["satellite"].format(tail=tail)
                summary = None
            else:
                answer = llm_answers[view.id]
                if answer is None:
                    fallback += 1
                    weight, confidence = verdict.hint, FALLBACK_CONFIDENCE
                    rationale, summary = lang["fallback"], None
                else:
                    llm_judged += 1
                    weight = answer["weight"]
                    conf = clamp_unit(answer.get("confidence"))
                    confidence = 0.5 if conf is None else conf
                    rationale = str(answer.get("rationale") or "").strip()
                    summary = str(answer.get("summary") or "").strip() or None
            title = str(view.content.get("title") or codes[view.id])
            label = lang["summary_kernel" if weight == "kernel" else "summary_satellite"]
            drafts.append(
                EvidenceDraft(
                    claim_type="event_role",
                    summary=summary or f"{label}：{title}",
                    confidence=confidence,
                    content={"event_id": view.id, "weight": weight, "rationale": rationale},
                    derived_from=derived,
                    discourse_chapter=view.chapter,
                )
            )
        ctx.summary.update(
            {
                "event_count": len(views),
                "link_count": len(links),
                "longest_chain_length": graph.chain_length,
                "back_edges_removed": graph.removed_back_edges,
                "mechanical_count": mechanical,
                "llm_count": llm_judged,
                "llm_abstained_count": fallback,
                "kernel_count": sum(1 for d in drafts if d.content["weight"] == "kernel"),
            }
        )
        return drafts


def _link_lines(
    links: list[EvidenceView],
    link_codes: dict[str, str],
    codes: dict[str, str],
    by_id: dict[str, EvidenceView],
    other_end: str,
) -> str:
    """每條連結一行 JSON：連結代號、對方事件的代號與標題、類型。"""
    if not links:
        return "(none)"
    rows = []
    for link in links:
        other = link.content[other_end]
        rows.append(
            json.dumps(
                {
                    "id": link_codes[link.id],
                    "event_id": codes[other],
                    "title": by_id[other].content.get("title"),
                    "link_type": link.content.get("link_type"),
                },
                ensure_ascii=False,
            )
        )
    return "\n".join(rows)
