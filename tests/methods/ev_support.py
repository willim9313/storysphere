"""EV2／EV1 測試共用：假 llm（依 prompt 內容回答）、播種事件與因果連結、組引擎。"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from sqlalchemy import select
from storysphere.methods.engine import MethodEngine, default_registry
from storysphere.methods.implementations import MethodImplementations
from storysphere.methods.universal.causal_network import CausalNetwork
from storysphere.methods.universal.kernel_satellite import KernelSatellite
from storysphere.store.evidence_writer import WriteContext, write_evidence
from storysphere.store.tables import Evidence, EvidenceLink, Run

from tests.methods.support import BOOK, seed
from tests.store.conftest import make_draft

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "llm"
REGISTRY = default_registry()
EV2_ID, EV1_ID = "event.causal_network", "event.kernel_satellite"


def fixture_text(task: str, name: str) -> str:
    return json.loads((FIXTURES / task / f"{name}.json").read_text(encoding="utf-8"))["response_text"]


def reply(obj: Any) -> str:
    return "```json\n" + json.dumps(obj, ensure_ascii=False) + "\n```"


class ScriptedLlm:
    """假 llm：`responder(user_text, call_no)` 回字串或丟例外；記下每次的 system／user。"""

    def __init__(self, responder: Callable[[str, int], str]) -> None:
        self.responder = responder
        self.calls = 0
        self.systems: list[str] = []
        self.users: list[str] = []

    async def ainvoke(self, messages: Any = None) -> Any:
        self.calls += 1
        system, user = messages[0].content, messages[1].content
        self.systems.append(system)
        self.users.append(user)
        out = self.responder(user, self.calls)
        if isinstance(out, Exception):
            raise out
        return SimpleNamespace(content=out)


def window_codes(user_text: str) -> list[str]:
    """EV2 prompt 裡這一窗的事件代號（依出現順序）。"""
    return re.findall(r'^\{"id": "(E\d+)"', user_text, flags=re.MULTILINE)


def make_engine(sf, llm: ScriptedLlm, *method_ids: str) -> MethodEngine:
    classes = {EV2_ID: CausalNetwork, EV1_ID: KernelSatellite}
    impls = MethodImplementations()
    for method_id in method_ids:
        impls.register(classes[method_id](REGISTRY.methods[method_id]))
    return MethodEngine(
        sf, REGISTRY, impls, llm_factory=lambda _task: llm, model_info=lambda _t: ("fake", "fake-1")
    )


async def seed_events(sf, count: int, *, first_rank: int = 1, **content: Any) -> list[str]:
    """`count` 個事件，text_rank 連續；回傳依 text_rank 的 evidence id。"""
    ids = []
    for i in range(first_rank, first_rank + count):
        ids.append(
            await seed(
                sf, "event", title=f"事件{i}", description=f"事件{i}的描述，發生在倫敦的某個夜晚。",
                text_rank=i, chapter=1 + i // 10, **content,
            )
        )
    return ids


async def seed_link(sf, cause: str, effect: str, link_type: str = "physical") -> str:
    ctx = WriteContext(book_id=BOOK, source="method", produced_via="pipeline")
    draft = make_draft(
        "causal_link",
        content={"cause_event_id": cause, "effect_event_id": effect, "link_type": link_type,
                 "strength": 0.8},
        derived_from=[cause, effect],
    )
    async with sf() as session, session.begin():
        return (await write_evidence(session, ctx, draft)).id


async def evidence_of(sf, claim_type: str) -> list[Evidence]:
    async with sf() as session:
        return list(
            await session.scalars(select(Evidence).where(Evidence.claim_type == claim_type))
        )


async def upstream_of(sf, evidence_id: str) -> set[str]:
    async with sf() as session:
        return set(
            await session.scalars(
                select(EvidenceLink.upstream_id).where(EvidenceLink.evidence_id == evidence_id)
            )
        )


async def runs_of(sf, ref_id: str) -> list[Run]:
    async with sf() as session:
        return list(await session.scalars(select(Run).where(Run.ref_id == ref_id)))


async def content_of(sf, evidence_id: str, claim_type: str) -> dict[str, Any]:
    from storysphere.store.content_tables import CONTENT_TABLES

    table = CONTENT_TABLES[claim_type]
    async with sf() as session:
        row = (
            await session.execute(select(table).where(table.c.evidence_id == evidence_id))
        ).mappings().one()
    return {k: v for k, v in row.items() if k != "evidence_id"}
