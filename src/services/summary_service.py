"""SummaryService — LLM-based chapter and book summarization.

All LLM summarization capability lives here. Pipelines and tools
delegate to this service (ADR: tools/pipelines never own LLM logic).

Uses tenacity retry (3 attempts, exponential backoff).
"""

from __future__ import annotations

import logging

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


_CHAPTER_SYSTEM_PROMPT = """\
You are a literary summarizer. Summarize the following chapter text in 3-5 sentences.
Focus on key plot points, character actions, and important developments.
Return ONLY the summary text — no preamble or formatting."""

_BOOK_SYSTEM_PROMPT = """\
You are a literary summarizer. Given the chapter-by-chapter summaries of a novel,
produce a cohesive 5-10 sentence summary of the entire book.
Cover the main plot arc, key characters, and central themes.
Return ONLY the summary text — no preamble or formatting."""


class SummaryService:
    """Generate chapter and book summaries via LLM."""

    def __init__(self, llm=None) -> None:
        self._llm = llm

    def _get_llm(self):
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            from config.settings import get_settings  # noqa: PLC0415

            settings = get_settings()
            self._llm = get_llm_client().get_with_local_fallback(
                temperature=settings.summary_temperature
            )
        return self._llm

    async def summarize_chapter(
        self,
        text: str,
        chapter_number: int,
        title: str | None = None,
        language: str = "en",
    ) -> str:
        """Generate a 3-5 sentence summary for a chapter."""
        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        truncated = text[: settings.summary_max_chapter_chars]

        header = f"Chapter {chapter_number}"
        if title:
            header += f": {title}"

        summary = await self._call_llm_chapter(truncated, header, language)
        logger.info(
            "SummaryService: chapter=%d  summary_len=%d", chapter_number, len(summary)
        )
        return summary

    async def summarize_book(
        self,
        chapter_summaries: list[dict[str, str]],
        book_title: str | None = None,
        language: str = "en",
    ) -> str:
        """Generate a 5-10 sentence book summary from chapter summaries."""
        parts: list[str] = []
        for cs in chapter_summaries:
            label = f"Chapter {cs['chapter_number']}"
            if cs.get("title"):
                label += f": {cs['title']}"
            parts.append(f"{label}\n{cs['summary']}")
        combined = "\n\n".join(parts)

        header = f"Book: {book_title}" if book_title else "Book"
        summary = await self._call_llm_book(combined, header, language)
        logger.info("SummaryService: book summary generated  len=%d", len(summary))
        return summary

    # -- LLM calls with retry ------------------------------------------------

    @retry(
        retry=retry_if_exception_type((ValueError, RuntimeError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_llm_chapter(
        self, text: str, header: str, language: str = "en"
    ) -> str:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        llm = self._get_llm()
        system_prompt = _CHAPTER_SYSTEM_PROMPT + f"\nRespond in {language}."
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"{header}\n\n{text}"),
        ]
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        if not content.strip():
            raise ValueError("LLM returned empty summary")
        return content.strip()

    @retry(
        retry=retry_if_exception_type((ValueError, RuntimeError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_llm_book(
        self, chapter_text: str, header: str, language: str = "en"
    ) -> str:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        llm = self._get_llm()
        system_prompt = _BOOK_SYSTEM_PROMPT + f"\nRespond in {language}."
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"{header}\n\n{chapter_text}"),
        ]
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        if not content.strip():
            raise ValueError("LLM returned empty summary")
        return content.strip()
