from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str  # "user" | "assistant" | "tool"
    content: str


class ChatState(BaseModel):
    # 對話歷史（保留最近 5-10 輪）
    conversation_history: list[Message] = Field(default_factory=list)

    # 實體追蹤
    detected_entities: list[str] = Field(default_factory=list)

    # 當前意圖
    intent: Optional[str] = None

    # 工具結果
    tool_results: dict[str, Any] = Field(default_factory=dict)

    # ===== 指代消解 =====
    current_focus_entity: Optional[str] = None
    entity_mentions: dict[str, int] = Field(default_factory=dict)

    # ===== 工具結果緩存 (5min TTL 由外部管理) =====
    last_tool_results: dict[str, Any] = Field(default_factory=dict)

    # 上次查詢類型
    last_query_type: Optional[str] = None
