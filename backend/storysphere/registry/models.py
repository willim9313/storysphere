"""Declaration schemas for the registry YAML files (docs/spec/03 §1, §5; 05 §4).

registry 是五組檔案（repo 根目錄 `registry/`）：
  methods/*.yaml、methodologies/*.yaml、views/*.yaml、perspectives/*.yaml，
  加上 claim_types.yaml（第 1 層證據類型屬於哪一層、哪個機制）與 orphans_allowed.yaml。
YAML 的 key 一律 snake_case；多出來的 key 直接驗證失敗。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Layer = Literal["universal", "genre"]
# 契約 v2「方法目錄與文獻」的依據等級；CH1 在該表標「理論＋技法」。
Grade = Literal["理論", "技法", "衍生", "使用者自建", "理論＋技法"]
Scope = Literal[
    "book",
    "per_character",
    "per_character_chapter",
    "per_event",
    "per_hidden_truth",
    "per_motif",
    "per_trick",
]
LlmTask = Literal["method_strong", "method_light"]


class _Decl(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Precondition(_Decl):
    exists: str  # claim_type


class Requirement(_Decl):
    claim_type: str
    genre_ext: str | None = None
    # 有就讀、沒有也照跑，不觸發上游補跑（03 §1）。
    optional: bool = False
    # 只讀某個來源的證據；讀 user／agent 的詮釋要另外宣告 allow_interpretation（規則 4）。
    source: Literal["extraction", "method", "user", "agent"] | None = None


class Impl(_Decl):
    kind: Literal["llm", "algorithmic", "hybrid"]
    module: str
    llm_task: LlmTask | None = None
    prompt: str | None = None
    config: list[str] = Field(default_factory=list)


class MethodDecl(_Decl):
    kind: Literal["method"]
    id: str
    code: str
    version: int = Field(ge=1)
    layer: Layer
    mechanism: str
    question: str
    basis: str
    grade: Grade
    preconditions: list[Precondition] = Field(default_factory=list)
    requires: list[Requirement]
    allow_interpretation: bool = False
    produces: str  # 每個方法只產出一種
    scope: Scope
    scope_selector: str | None = None
    impl: Impl
    view: str
    priority: Literal["P0", "P1"]


class Synthesis(_Decl):
    produces: str
    llm_task: LlmTask
    prompt: str


class Step(_Decl):
    """One methodology step: either a method/methodology id, or the final synthesis."""

    method: str | None = None
    synthesis: Synthesis | None = None


class MethodologyDecl(_Decl):
    kind: Literal["methodology"]
    id: str
    code: str | None = None
    version: int = Field(ge=1)
    owner: Literal["contract", "user"]
    question: str
    basis: str | None = None
    grade: Grade
    steps: list[Step] = Field(min_length=1)
    view: str | None = None
    priority: Literal["P0", "P1"] | None = None


class ViewDecl(_Decl):
    view_type: str
    description: str


class ViewCatalog(_Decl):
    kind: Literal["views"]
    views: list[ViewDecl]


class Card(_Decl):
    ref: str  # 方法或方法論 id
    question: str  # 結果卡標題（03 §5）


class PerspectiveDecl(_Decl):
    kind: Literal["perspective"]
    genre: str  # universal 或契約 v2 視角表的題材
    cards: list[Card]


class Mechanism(_Decl):
    id: str  # 入庫訊號用的 key，例如 info_control
    name: str  # 例如 資訊控制
    question: str  # 契約 v2「給使用者的問題」
    supported: bool


class MechanismCatalog(_Decl):
    kind: Literal["mechanisms"]
    mechanisms: list[Mechanism]


class Level1Type(_Decl):
    claim_type: str
    layer: Layer
    mechanism: str | None = None  # layer=genre 時必填


class ClaimTypeCatalog(_Decl):
    kind: Literal["claim_types"]
    level_1: list[Level1Type]


class Orphan(_Decl):
    claim_type: str
    reason: str


class OrphanList(_Decl):
    kind: Literal["orphans_allowed"]
    orphans: list[Orphan] = Field(default_factory=list)
