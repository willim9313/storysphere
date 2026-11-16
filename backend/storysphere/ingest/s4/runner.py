"""S4 深度抽取＋整併的主流程（02 §6）。

S4a（每個有 `info_control` 訊號的單位一次）→ 候選 → S4b（書層級，必要時分批）→ 第 1 層證據。
寫入在一個交易裡：一個 run（`ref_id="ingest.s4"`）的產出一起成功或一起失敗，`complete_run`
讓重跑時舊的一批變 superseded。S4a 的單位輸出留在 `ingest_unit_outputs`，重跑時已完成的
單位不再叫 LLM。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.ingest.s2.runner import write_all
from storysphere.ingest.s4.candidates import build_candidates, split_batches
from storysphere.ingest.s4.consolidate import BATCH_SIZE, consolidate
from storysphere.ingest.s4.drafts import Planned, build_plan, dedupe_plan
from storysphere.ingest.s4.plan import S4Plan, load_plan
from storysphere.ingest.s4.report import TRUTH_UNLINKED, S4Report
from storysphere.ingest.s4.stage import STAGE_NAME, make_s4a_stage, stage_prompt_version
from storysphere.ingest.unit_runner import run_stage
from storysphere.llm.prompts import load_prompt
from storysphere.llm.router import llm_for, primary_model_id
from storysphere.llm.settings import LlmSettings, load_settings
from storysphere.store.books import BookParagraphSource
from storysphere.store.content_tables import CONTENT_TABLES
from storysphere.store.evidence_writer import WriteContext
from storysphere.store.ingest_units import IngestUnitOutputRow
from storysphere.store.lifecycle import complete_run
from storysphere.store.tables import Run

logger = logging.getLogger(__name__)

S4_REF_ID = "ingest.s4"
DEEP_PROMPT = "ingest/deep/info_control"
MYSTERY_PROMPT = "ingest/deep/info_control.mystery"
CONSOLIDATE_PROMPT = "ingest/consolidate/info_control"


async def _load_s4a(session: AsyncSession, plan: S4Plan) -> tuple[dict[str, Any], dict[str, str]]:
    """S4a 的單位輸出，與這些單位的段落原文。"""
    wanted = {u.id for u in plan.units}
    outputs = {
        row.unit_id: row.raw_json
        for row in await session.scalars(
            select(IngestUnitOutputRow).where(
                IngestUnitOutputRow.book_id == plan.book_id,
                IngestUnitOutputRow.stage == STAGE_NAME,
            )
        )
        if row.unit_id in wanted
    }
    paragraph_ids = [pid for u in plan.units if u.id in outputs for pid in u.paragraph_ids]
    return outputs, await BookParagraphSource(session).get_texts(paragraph_ids)


async def _set_reveal_ids(
    session: AsyncSession,
    reveals: list[tuple[str, str, int, str]],
) -> None:
    """把 `hidden_truth.reveal_id` 填上（整併階段填，01 §6.2）。

    reveal 要有真相的 id 才能寫，真相的 `reveal_id` 又要 reveal 的 id，所以真相先寫、
    reveal 寫完再回頭補這一欄。一個真相有多個 reveal 時取「對讀者揭曉、章最早」的那筆，
    沒有對讀者的就取章最早的。``reveals``：``(truth id, reveal id, chapter, audience)``。
    """
    table = CONTENT_TABLES["hidden_truth"]
    best: dict[str, tuple[tuple[int, int], str]] = {}
    for truth_id, reveal_id, chapter, audience in reveals:
        rank = (0 if audience in ("reader", "both") else 1, chapter)
        if truth_id not in best or rank < best[truth_id][0]:
            best[truth_id] = (rank, reveal_id)
    for truth_id, (_, reveal_id) in best.items():
        await session.execute(
            update(table).where(table.c.evidence_id == truth_id).values(reveal_id=reveal_id)
        )


async def run_s4(
    session_factory: async_sessionmaker[AsyncSession],
    book_id: str,
    *,
    job_id: str | None = None,
    deep_llm: Any = None,
    consolidate_llm: Any = None,
    settings: LlmSettings | None = None,
    concurrency: int = 4,
    retry_delay: float = 1.0,
) -> S4Report | None:
    """Extract and consolidate the information-control evidence of ``book_id``.

    沒有 `genre_profile`、沒有有訊號的單位、或所有 S4a 單位都失敗時回 None（不寫 run）。
    llm 沒給時用 `llm_for("deep_extraction")`／`llm_for("consolidation")`。
    429 丟 `QuotaPaused`（已完成的單位留著，續跑只補剩下的）。
    """
    plan = await load_plan(session_factory, book_id)
    if plan is None:
        return None

    deep = load_prompt(DEEP_PROMPT)
    mystery_prompt = load_prompt(MYSTERY_PROMPT) if plan.mystery else None
    cons = load_prompt(CONSOLIDATE_PROMPT)
    if deep_llm is None or consolidate_llm is None:
        settings = settings or load_settings()
        deep_llm = deep_llm or llm_for(deep.task, settings=settings)
        consolidate_llm = consolidate_llm or llm_for(cons.task, settings=settings)
    deep_model = primary_model_id(settings, deep.task) if settings else None
    cons_model = primary_model_id(settings, cons.task) if settings else None

    report = S4Report(mystery_extension=plan.mystery, units_selected=len(plan.units))
    started_at = datetime.now(UTC)

    # ── S4a ──
    stage = make_s4a_stage(plan, deep, mystery_prompt, deep_llm, deep_model)
    report.failed_units = await run_stage(
        session_factory, stage, plan.units, retry_delay=retry_delay, concurrency=concurrency
    )
    async with session_factory() as session:
        outputs, texts = await _load_s4a(session, plan)
    report.units_extracted = len(outputs)
    if not outputs:
        return None
    report.units_used = len(outputs)

    # ── 候選 → S4b ──
    candidates = build_candidates(
        plan.units, outputs, texts, plan.characters, report, mystery=plan.mystery
    )
    state = None
    if candidates:
        state = await consolidate(
            consolidate_llm,
            cons,
            split_batches(candidates, BATCH_SIZE),
            plan.characters,
            report,
            language=plan.language,
            mystery=plan.mystery,
            retry_delay=retry_delay,
        )
    planned: list[Planned] = []
    if state is not None:
        planned = build_plan(state, candidates, report, mystery=plan.mystery)
        report.truths = len(state.truths)
    deduped, canonical = dedupe_plan(planned)
    report.merged_duplicates = len(planned) - len(deduped)

    # ── 寫入（一個交易） ──
    prompt_version = f"deep={stage_prompt_version(deep, mystery_prompt)};consolidate={cons.version}"
    async with session_factory() as session, session.begin():
        run = Run(
            book_id=book_id,
            ref_id=S4_REF_ID,
            prompt_version=prompt_version,
            model=deep_model,
            status="running",
            job_id=job_id,
            triggered_by="auto",
            started_at=started_at,
            params_json={"consolidation_model": cons_model, "batch_size": BATCH_SIZE},
        )
        session.add(run)
        await session.flush()
        report.run_id = run.id
        ctx = WriteContext(
            book_id=book_id, source="extraction", produced_via="pipeline", run_id=run.id
        )

        # 真相先寫：其他類型的內容要它的 id。
        truths = [p for p in deduped if p.claim_type == "hidden_truth"]
        truth_ids = await write_all(session, ctx, [p.draft for p in truths], report)
        evidence_of = {p.key: i for p, i in zip(truths, truth_ids, strict=True) if i is not None}
        evidence_of.update({k: evidence_of[v] for k, v in canonical.items() if v in evidence_of})

        rest: list[Planned] = []
        for p in deduped:
            if p.claim_type == "hidden_truth":
                continue
            ref_field = (
                "points_to_truth_id" if p.claim_type == "clue_points_to" else "hidden_truth_id"
            )
            ref = p.draft.content.get(ref_field)
            if ref is None:  # 沒連到真相的線索
                rest.append(p)
                continue
            truth_evidence = evidence_of.get(ref)
            if truth_evidence is None:
                if p.claim_type == "clue_points_to":
                    rest.append(
                        Planned(
                            p.key,
                            p.draft.model_copy(
                                update={"content": {**p.draft.content, ref_field: None}}
                            ),
                        )
                    )
                else:
                    report.drop(TRUTH_UNLINKED, f"{p.claim_type} '{p.draft.summary[:40]}'")
                continue
            content = {**p.draft.content, ref_field: truth_evidence}
            rest.append(Planned(p.key, p.draft.model_copy(update={"content": content})))

        rest_ids = await write_all(session, ctx, [p.draft for p in rest], report)
        await _set_reveal_ids(
            session,
            [
                (
                    p.draft.content["hidden_truth_id"],
                    evidence_id,
                    p.draft.discourse_chapter or 0,
                    p.draft.content["audience"],
                )
                for p, evidence_id in zip(rest, rest_ids, strict=True)
                if p.claim_type == "reveal" and evidence_id is not None
            ],
        )
        run.summary_json = report.to_dict()
        await complete_run(session, run.id)

    logger.info("run_s4 done: book=%s %s", book_id, report.to_dict())
    return report
