from __future__ import annotations

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str  # "user" | "assistant" | "tool"
    content: str


class ChatState(BaseModel):
    # 對話歷史（保留最近 5-10 輪）
    conversation_history: list[Message] = Field(default_factory=list)

    # 實體追蹤
    detected_entities: list[str] = Field(default_factory=list)

    # ===== 指代消解 =====
    current_focus_entity: str | None = None
    # canonical KG id，僅當 focus 來自前端明確選取的實體時才有值
    current_focus_entity_id: str | None = None
    entity_mentions: dict[str, int] = Field(default_factory=dict)

    # 上次查詢類型
    last_query_type: str | None = None

    # 輸出語言（跨 turn 持續保留）
    language: str = "en"

    # ===== Page context (injected from frontend) =====
    book_id: str | None = None
    book_title: str | None = None
    chapter_id: str | None = None
    chapter_title: str | None = None
    chapter_number: int | None = None
    page_context: str | None = None  # "library" | "reader" | "graph" | "analysis" | "timeline"
    analysis_tab: str | None = None  # "characters" | "events"

    # ── Methods ────────────────────────────────────────────────────────────────

    def add_entity_mention(self, entity: str, entity_id: str | None = None) -> None:
        """Track an entity mention and update focus entity.

        ``entity_id`` carries the canonical KG id when the mention came from an
        explicit UI selection; it lets downstream tools do a precise id lookup
        instead of an ambiguous name match. Always overwritten (may be ``None``)
        so focus never keeps a stale id from a previously-selected entity.
        """
        self.entity_mentions[entity] = self.entity_mentions.get(entity, 0) + 1
        self.current_focus_entity = entity
        self.current_focus_entity_id = entity_id
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

    def add_message(self, role: str, content: str) -> None:
        """Append a message to conversation history."""
        self.conversation_history.append(Message(role=role, content=content))

    def trim_history(self, max_turns: int = 10) -> None:
        """Keep only the last *max_turns* messages."""
        if len(self.conversation_history) > max_turns:
            self.conversation_history = self.conversation_history[-max_turns:]
