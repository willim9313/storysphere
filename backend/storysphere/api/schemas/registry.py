"""Schemas of the registry endpoints (docs/spec/04 §4.7).

registry YAML 的 key 是 snake_case，這裡轉成 camelCase；值（方法 id、view type、枚舉）不轉。
"""

from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from storysphere.api.schemas.common import ApiModel


class RequirementOut(ApiModel):
    claim_type: str
    genre_ext: str | None
    optional: bool
    source: str | None


class PreconditionOut(ApiModel):
    exists: str


class MethodSummary(ApiModel):
    """N-07a 的一列。"""

    id: str
    code: str
    version: int
    layer: str
    mechanism: str
    question: str
    basis: str
    grade: str
    produces: str
    requires: list[RequirementOut]
    preconditions: list[PreconditionOut]
    scope: str
    scope_selector: str | None
    view: str
    impl_kind: str
    llm_task: str | None
    priority: str
    implemented: bool  # 推得：引擎裡有沒有註冊這個方法的實作


class ImplOut(ApiModel):
    kind: str
    module: str
    llm_task: str | None
    prompt: str | None
    config: list[str]


class MethodDetail(MethodSummary):
    """N-07b：完整宣告，加上從 DAG 推得的兩個清單。"""

    allow_interpretation: bool
    impl: ImplOut
    used_by_methodologies: list[str]
    downstream_methods: list[str]  # 讀這個方法產出的方法


class SynthesisOut(ApiModel):
    produces: str
    llm_task: str
    prompt: str


class StepOut(ApiModel):
    """方法論的一步：`method`（方法或方法論 id）或最後的 `synthesis`。"""

    method: str | None
    synthesis: SynthesisOut | None
    # 使用者方法論的步驟可帶 run_method 當時的 `inputs`（N-07e）；內建的沒有。
    input: dict[str, Any] | None = None


class MethodologyOut(ApiModel):
    """N-07c 的一列、N-07d 的回應（04 §4.7）。"""

    id: str
    code: str | None
    version: int
    owner: str
    question: str
    basis: str | None
    grade: str
    steps: list[StepOut]
    view: str | None
    priority: str | None
    implemented: bool


class DagNode(ApiModel):
    id: str
    kind: str  # claim_type／method／methodology
    layer: str | None
    mechanism: str | None
    level: int | None = None  # 只有 claim_type 節點有


class DagEdge(ApiModel):
    from_: str = Field(alias="from")
    to: str
    kind: str  # requires／produces／step


class Dag(ApiModel):
    nodes: list[DagNode]
    edges: list[DagEdge]


class ViewTypeOut(ApiModel):
    view_type: str
    description: str
    used_by: list[str]  # 用這個 view 的方法與方法論 id


class PerspectiveCard(ApiModel):
    ref_id: str
    question: str


class PerspectiveOut(ApiModel):
    genre: str
    cards: list[PerspectiveCard]


class ViewCatalogOut(ApiModel):
    view_types: list[ViewTypeOut]
    perspectives: list[PerspectiveOut]


class SessionTurnIn(ApiModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    session_id: str
    turn_id: str


class MethodologyIn(ApiModel):
    """N-07e 的 request。原型只做 `fromSession`；`steps`、`fromNoteId` 收下來只為了回 422。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    question: str = Field(min_length=1)
    from_session: SessionTurnIn | None = None
    steps: list[dict[str, Any]] | None = None
    from_note_id: str | None = None
