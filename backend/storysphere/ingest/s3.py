"""S3 題材判定（02 §5）：由 S1 的 `s1b` 訊號算機制密度，一次 LLM 呼叫判主題材。

- 密度、強訊號引文、開頭樣本都由程式組好（純函式）；LLM 只做判斷。
- `mechanism_density` 一律用程式算的值，不採用 LLM 抄回來的。
- 不產生證據，只寫 `books.genre_profile` 與一筆 `runs`（`ref_id="ingest.s3"`）。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

import yaml
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.domain.documents import ChapterRole, Document, extract_body_text
from storysphere.domain.genres import GENRES
from storysphere.ingest.language_detection import get_language_display_name
from storysphere.ingest.unit_runner import MAX_ATTEMPTS, QuotaPaused
from storysphere.ingest.units import build_units
from storysphere.llm.errors import classify_step_failure, describe_exception, llm_text
from storysphere.llm.json_output import extract_json_from_text
from storysphere.llm.prompts import load_prompt
from storysphere.llm.router import llm_for, primary_model_id
from storysphere.llm.settings import REPO_ROOT, LlmSettings, load_settings
from storysphere.registry.models import MechanismCatalog
from storysphere.store.books import get_book, set_genre_profile
from storysphere.store.ingest_units import IngestUnitOutputRow
from storysphere.store.lifecycle import complete_run
from storysphere.store.tables import Run

logger = logging.getLogger(__name__)

S3_REF_ID = "ingest.s3"
PROMPT_NAME = "ingest/genre_detection"
QUOTES_PER_MECHANISM = 5
OPENING_CHARS = 2000
_NONE = "none"
_UNKNOWN = "(unknown)"
_MECHANISMS_FILE = REPO_ROOT / "registry" / "perspectives" / "mechanisms.yaml"

# (章號, 該單位 s1b 的 raw_json)，依書中順序。
UnitSignals = tuple[int, Any]


@lru_cache(maxsize=1)
def mechanism_ids() -> tuple[str, ...]:
    """七個機制的 id；來源是 registry 的 `perspectives/mechanisms.yaml`。"""
    data = yaml.safe_load(_MECHANISMS_FILE.read_text(encoding="utf-8"))
    return tuple(m.id for m in MechanismCatalog.model_validate(data).mechanisms)


@dataclass(frozen=True)
class MechanismStats:
    density: float
    strong_share: float
    # 有訊號的章號範圍（最小、最大）；沒有訊號是 None。
    chapters: tuple[int, int] | None


def _valid_signals(raw: Any, mechanisms: Sequence[str]) -> list[dict[str, Any]]:
    """One unit's usable signals; anything malformed is skipped."""
    signals = raw.get("signals") if isinstance(raw, dict) else None
    if not isinstance(signals, list):
        return []
    return [s for s in signals if isinstance(s, dict) and s.get("mechanism") in mechanisms]


def compute_density(units: Sequence[UnitSignals]) -> dict[str, MechanismStats]:
    """Per mechanism: share of units carrying a signal, strong share, chapter range.

    總單位數＝傳入的單位數（呼叫端只傳有 `s1b` 輸出的單位）。同一單位多個訊號只算一次。
    """
    mechanisms = mechanism_ids()
    total = len(units)
    result: dict[str, MechanismStats] = {}
    for mechanism in mechanisms:
        with_signal: list[int] = []
        strong = 0
        for chapter, raw in units:
            hits = [s for s in _valid_signals(raw, mechanisms) if s["mechanism"] == mechanism]
            if hits:
                with_signal.append(chapter)
                strong += any(s.get("strength") == "strong" for s in hits)
        n = len(with_signal)
        result[mechanism] = MechanismStats(
            density=round(n / total, 2) if total else 0.0,
            strong_share=round(strong / n, 2) if n else 0.0,
            chapters=(min(with_signal), max(with_signal)) if n else None,
        )
    return result


def density_values(stats: dict[str, MechanismStats]) -> dict[str, float]:
    return {m: s.density for m, s in stats.items()}


def density_table(stats: dict[str, MechanismStats]) -> str:
    lines = ["| mechanism | density | strong_share | chapters |", "| --- | --- | --- | --- |"]
    for mechanism, s in stats.items():
        if s.chapters is None:
            span = "-"
        else:
            low, high = s.chapters
            span = str(low) if low == high else f"{low}-{high}"
        lines.append(f"| {mechanism} | {s.density:.2f} | {s.strong_share:.2f} | {span} |")
    return "\n".join(lines)


def strong_quotes(units: Sequence[UnitSignals], per_mechanism: int = QUOTES_PER_MECHANISM) -> str:
    """每個機制依書中順序的前 N 個 strong 訊號引文，標上機制與章號。"""
    mechanisms = mechanism_ids()
    found: dict[str, list[str]] = {m: [] for m in mechanisms}
    for chapter, raw in units:
        for signal in _valid_signals(raw, mechanisms):
            quote = signal.get("quote")
            bucket = found[signal["mechanism"]]
            if (
                signal.get("strength") == "strong"
                and isinstance(quote, str)
                and quote.strip()
                and len(bucket) < per_mechanism
            ):
                bucket.append(f'- [{signal["mechanism"]}, ch {chapter}] "{quote.strip()}"')
    lines: list[str] = []
    for mechanism in mechanisms:
        lines.append(f"{mechanism}:")
        lines.extend(found[mechanism] or [f"- {_NONE}"])
    return "\n".join(lines)


def opening_sample(doc: Document, limit: int = OPENING_CHARS) -> str:
    """全書正文開頭 ``limit`` 字（正文章、正文段落，不含章標題）。"""
    parts: list[str] = []
    size = 0
    for chapter in doc.chapters:
        if chapter.role != ChapterRole.body:
            continue
        for paragraph in chapter.paragraphs:
            body = extract_body_text(paragraph)
            if not body:
                continue
            parts.append(body)
            size += len(body) + 2
            if size >= limit:
                return "\n\n".join(parts)[:limit]
    return "\n\n".join(parts)[:limit]


@dataclass(frozen=True)
class _S3Input:
    doc: Document
    stats: dict[str, MechanismStats]
    units: list[UnitSignals]


async def _load_input(
    session_factory: async_sessionmaker[AsyncSession], book_id: str
) -> _S3Input | None:
    """S3 的輸入；沒有可用的 `s1b` 輸出，或整本書一個訊號都沒有時回 None。

    「可用」＝輸出是 dict 且有 `signals` key（真正的 S1b 輸出一定有，見 `s1.S1B_KEYS`）。
    """
    async with session_factory() as session:
        doc = await get_book(session, book_id)
        if doc is None:
            raise LookupError(f"Book {book_id} not found")
        outputs = {
            row.unit_id: row.raw_json
            for row in await session.scalars(
                select(IngestUnitOutputRow).where(
                    IngestUnitOutputRow.book_id == book_id, IngestUnitOutputRow.stage == "s1b"
                )
            )
        }
    units = [
        (unit.chapter, outputs[unit.id])
        for unit in build_units(doc)
        if isinstance(outputs.get(unit.id), dict) and "signals" in outputs[unit.id]
    ]
    if not units:
        return None
    stats = compute_density(units)
    # 一個訊號都沒有時，密度表全是 0，判不出什麼，不花一次呼叫。
    if all(s.chapters is None for s in stats.values()):
        return None
    return _S3Input(doc, stats, units)


async def has_s3_input(session_factory: async_sessionmaker[AsyncSession], book_id: str) -> bool:
    return await _load_input(session_factory, book_id) is not None


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _clean_mixed(raw: Any, primary: str) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        raise ValueError("'mixed' must be a list")
    mixed: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        genre, score, chapters = item.get("genre"), item.get("score"), item.get("chapters")
        if genre not in GENRES or genre == primary:
            continue
        if not _is_number(score) or not 0 <= score <= 1:
            continue
        if not isinstance(chapters, list) or not all(_is_int(c) for c in chapters):
            continue
        mixed.append({"genre": genre, "score": score, "chapters": chapters})
    return mixed


def parse_genre_response(text: str) -> dict[str, Any]:
    """LLM 回應 → `{primary, mixed, rationale}`；解析或驗證失敗丟 `ValueError`。"""
    data, error = extract_json_from_text(text)
    if data is None:
        raise ValueError(f"genre_detection: no parsable JSON ({error}); starts: {text[:200]!r}")
    if not isinstance(data, dict):
        raise ValueError(f"genre_detection: expected a JSON object, got {type(data).__name__}")
    primary = data.get("primary")
    if primary not in GENRES:
        raise ValueError(f"genre_detection: invalid primary {primary!r}")
    rationale = data.get("rationale")
    if not isinstance(rationale, str):
        raise ValueError("genre_detection: 'rationale' must be a string")
    return {
        "primary": primary,
        "mixed": _clean_mixed(data.get("mixed", []), primary),
        "rationale": rationale,
    }


async def run_s3(
    session_factory: async_sessionmaker[AsyncSession],
    book_id: str,
    *,
    job_id: str | None = None,
    llm: Any = None,
    settings: LlmSettings | None = None,
    model_id: str | None = None,
    retry_delay: float = 1.0,
) -> dict[str, Any] | None:
    """判定題材並寫進 `books.genre_profile`；沒有輸入時回 None（不叫 LLM）。

    `llm` 是任何有 async `ainvoke(messages)` 的物件；沒給時用 `llm_for("genre_detection")`。
    429 丟 `QuotaPaused`；blocked／未設定不重試；其餘失敗最多試 `MAX_ATTEMPTS` 次再往外丟。
    """
    loaded = await _load_input(session_factory, book_id)
    if loaded is None:
        return None
    doc, stats = loaded.doc, loaded.stats

    prompt = load_prompt(PROMPT_NAME)
    if llm is None:
        settings = settings or load_settings()
        llm = llm_for(prompt.task, settings=settings)
    if model_id is None and settings is not None:
        model_id = primary_model_id(settings, prompt.task)

    table = density_table(stats)
    system, user = prompt.render(
        title=doc.title,
        author=doc.author or _UNKNOWN,
        density_table=table,
        strong_quotes=strong_quotes(loaded.units),
        opening_sample=opening_sample(doc),
        language_name=get_language_display_name(doc.language),
    )
    messages = [SystemMessage(system), HumanMessage(user)]

    started_at = datetime.now(UTC)
    parsed: dict[str, Any] | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            parsed = parse_genre_response(llm_text(await llm.ainvoke(messages)))
            break
        except Exception as exc:
            kind = classify_step_failure(exc)
            if kind == "rate_limited":
                raise QuotaPaused(describe_exception(exc)) from exc
            if kind in ("blocked", "llm_unconfigured") or attempt == MAX_ATTEMPTS:
                raise
            logger.warning("genre_detection attempt %d failed: %s", attempt, describe_exception(exc))
            if retry_delay:
                await asyncio.sleep(retry_delay)
    assert parsed is not None

    profile = {
        "primary": parsed["primary"],
        "mixed": parsed["mixed"],
        "mechanism_density": density_values(stats),  # 程式算的，不用 LLM 抄回來的
        "rationale": parsed["rationale"],
        "detected_by": model_id,
        "detected_at": datetime.now(UTC).isoformat(),
    }
    async with session_factory() as session, session.begin():
        run = Run(
            book_id=book_id,
            ref_id=S3_REF_ID,
            prompt_version=prompt.version,
            model=model_id,
            status="running",
            job_id=job_id,
            triggered_by="auto",
            started_at=started_at,
            summary_json={
                "primary": parsed["primary"],
                "density": {
                    m: {
                        "density": s.density,
                        "strong_share": s.strong_share,
                        "chapters": list(s.chapters) if s.chapters else None,
                    }
                    for m, s in stats.items()
                },
            },
        )
        session.add(run)
        await session.flush()
        await set_genre_profile(session, book_id, profile)
        # S3 沒有證據，不會取代任何東西；呼叫只是把 run 標成 done 並寫 finished_at。
        await complete_run(session, run.id)

    logger.info("run_s3 done: book=%s primary=%s", book_id, parsed["primary"])
    return profile
