from __future__ import annotations

from datetime import datetime
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

    # 輸出語言（跨 turn 持續保留）
    language: str = "en"

    # ===== Page context (injected from frontend) =====
    book_id: Optional[str] = None
    book_title: Optional[str] = None
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    chapter_number: Optional[int] = None
    page_context: Optional[str] = None  # "library" | "reader" | "graph" | "analysis" | "timeline"
    analysis_tab: Optional[str] = None  # "characters" | "events"

    # ── Methods ────────────────────────────────────────────────────────────────

    def add_entity_mention(self, entity: str) -> None:
        """Track an entity mention and update focus entity."""
        self.entity_mentions[entity] = self.entity_mentions.get(entity, 0) + 1
        self.current_focus_entity = entity
        if entity not in self.detected_entities:
            self.detected_entities.append(entity)

    def resolve_pronoun(self, pronoun: str) -> str | None:
        """Resolve a pronoun to the current focus entity.

        Supports: he, she, they, it, him, her, them,
                  他, 她, 它, 他們, 她們, 它們
        """
        pronoun_set = {
            "he", "she", "they", "it", "him", "her", "them",
            "他", "她", "它", "他們", "她們", "它們",
        }
        if pronoun.lower().strip() in pronoun_set:
            return self.current_focus_entity
        return None

    def cache_tool_result(self, tool_name: str, result: Any) -> None:
        """Cache a tool result with timestamp."""
        self.last_tool_results[tool_name] = {
            "result": result,
            "timestamp": datetime.now().isoformat(),
        }

    def get_cached_result(self, tool_name: str, ttl_seconds: int = 300) -> Any | None:
        """Return cached result if it exists and is younger than *ttl_seconds*."""
        entry = self.last_tool_results.get(tool_name)
        if entry is None:
            return None
        cached_time = datetime.fromisoformat(entry["timestamp"])
        if (datetime.now() - cached_time).total_seconds() > ttl_seconds:
            return None
        return entry["result"]

    def add_message(self, role: str, content: str) -> None:
        """Append a message to conversation history."""
        self.conversation_history.append(Message(role=role, content=content))

    def trim_history(self, max_turns: int = 10) -> None:
        """Keep only the last *max_turns* messages."""
        if len(self.conversation_history) > max_turns:
            self.conversation_history = self.conversation_history[-max_turns:]
