"""Response schema for GET /api/v1/token-usage (#17)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _Camel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class TokenBucket(_Camel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    calls: int


class BookUsage(TokenBucket):
    # None = calls that belong to no book (global chat, records predating attribution).
    book_id: str | None
    # None with a book_id = the book was deleted; its spending still counts.
    title: str | None


class DailyUsage(TokenBucket):
    date: str  # YYYY-MM-DD, host local time


class TokenUsageSummary(_Camel):
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    total_calls: int


class TokenUsageResponse(_Camel):
    summary: TokenUsageSummary
    by_service: dict[str, TokenBucket]
    by_model: dict[str, TokenBucket]
    by_book: list[BookUsage]
    daily: list[DailyUsage]
