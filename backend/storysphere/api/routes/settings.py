"""N-08a–N-08d：LLM 設定與初次啟動測試。"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Any

import yaml
from fastapi import APIRouter, Request
from sqlalchemy import select

from storysphere.api.deps import JobTasksDep, SessionDep
from storysphere.api.errors import validation_error
from storysphere.api.schemas.jobs import JobAccepted
from storysphere.api.schemas.settings import (
    LatestTest,
    LatestTests,
    LlmSettingsIn,
    LlmSettingsOut,
    LlmTestIn,
    ModelOut,
    ProviderOut,
    TaskOut,
)
from storysphere.llm.settings import (
    KNOWN_TASKS,
    SUBSCRIPTION_RISK_NOTICE,
    LlmSettings,
    caps_ok,
    caps_problems,
    load_settings,
    provider_configured,
    settings_path,
)
from storysphere.llm.startup_test import run_llm_test
from storysphere.store.tables import Job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])

LLM_TEST_KIND = "llm_test"
BRAIN_TEST_KIND = "brain_test"


def _settings_out(settings: LlmSettings) -> LlmSettingsOut:
    return LlmSettingsOut(
        providers=[
            ProviderOut(
                name=name,
                type=provider.type,
                api_key_env=provider.api_key_env,
                configured=provider_configured(provider),
                via=provider.via,
                base_url=provider.base_url,
                risk_notice=SUBSCRIPTION_RISK_NOTICE if provider.type == "subscription" else None,
            )
            for name, provider in settings.providers.items()
        ],
        models=[
            ModelOut(name=name, provider=model.provider, model_id=model.id, caps=list(model.caps))
            for name, model in settings.models.items()
        ],
        tasks=[
            TaskOut(
                task=task,
                model=config.model if config else None,
                fallback=list(config.fallback) if config else [],
                requires=list(config.requires) if config else [],
                caps_ok=caps_ok(settings, task) if config else False,
            )
            for task, config in ((task, settings.tasks.get(task)) for task in KNOWN_TASKS)
        ],
    )


@router.get("/llm", response_model=LlmSettingsOut)
async def get_llm_settings() -> LlmSettingsOut:
    """N-08a 三層設定。`var/settings.yaml` 不存在時是 repo 的預設檔。"""
    return _settings_out(load_settings())


def _write_yaml(data: dict[str, Any]) -> None:
    """Write the settings file atomically, keeping top-level keys this endpoint doesn't own."""
    target = settings_path()
    existing: dict[str, Any] = {}
    if target.exists():
        loaded = yaml.safe_load(target.read_text(encoding="utf-8"))
        existing = loaded if isinstance(loaded, dict) else {}
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(target.name + ".tmp")
    temp.write_text(
        yaml.safe_dump({**existing, **data}, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )
    os.replace(temp, target)


@router.put("/llm", response_model=LlmSettingsOut)
async def put_llm_settings(body: LlmSettingsIn, request: Request) -> LlmSettingsOut:
    """N-08b 更新三層設定，寫進 `var/settings.yaml`。

    provider 只能填環境變數名稱；填了像 key 的值、task 指到不存在的模型、能力不符都回 422。
    """
    data = {
        "providers": {
            p.name: {
                key: value
                for key, value in {
                    "type": p.type, "api_key_env": p.api_key_env, "via": p.via, "base_url": p.base_url,
                }.items()
                if value is not None
            }
            for p in body.providers
        },
        "models": {m.name: {"provider": m.provider, "id": m.model_id, "caps": m.caps} for m in body.models},
        "tasks": {
            t.task: {"model": t.model, "fallback": t.fallback, "requires": t.requires}
            for t in body.tasks
            if t.model is not None
        },
    }  # fmt: skip
    try:
        settings = LlmSettings.model_validate(data)
    except ValueError as exc:
        # 只回位置與訊息，不回輸入值（可能是誤貼的 key）。
        errors = getattr(exc, "errors", None)
        detail = (
            "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in errors())
            if callable(errors)
            else str(exc)
        )
        raise validation_error(detail) from None
    problems = caps_problems(settings)
    if problems:
        raise validation_error("; ".join(problems))
    _write_yaml(data)
    # 入庫服務的 S1 stage 是用舊設定建的；下次用到時重建。
    request.app.state.ingest_service = None
    return _settings_out(settings)


async def _run_llm_test(session_factory, job_id: str, models: list[str] | None) -> None:
    async with session_factory() as session, session.begin():
        job = await session.get(Job, job_id)
        job.status, job.started_at = "running", datetime.now(UTC)
    try:
        result = await run_llm_test(load_settings(), models)
    except Exception as exc:
        logger.exception("LLM test job %s failed", job_id)
        async with session_factory() as session, session.begin():
            job = await session.get(Job, job_id)
            job.status, job.error, job.error_kind = "error", str(exc), "internal"
            job.finished_at = datetime.now(UTC)
        return
    async with session_factory() as session, session.begin():
        job = await session.get(Job, job_id)
        job.result_json = result.model_dump(mode="json", by_alias=True)
        job.status, job.progress, job.finished_at = "done", 100, datetime.now(UTC)


@router.post("/llm/test", status_code=202, response_model=JobAccepted)
async def test_llm(
    body: LlmTestIn, session: SessionDep, tasks: JobTasksDep, request: Request
) -> JobAccepted:
    """N-08c 初次啟動測試：每個模型跑連線、structured output、延遲（建 `llm_test` job）。"""
    settings = load_settings()
    unknown = sorted(set(body.models or []) - settings.models.keys())
    if unknown:
        raise validation_error(f"models: unknown model(s): {', '.join(unknown)}")
    job = Job(kind=LLM_TEST_KIND, title="LLM 初次啟動測試", status="pending",
              params_json={"models": body.models})  # fmt: skip
    session.add(job)
    await session.commit()
    tasks.spawn(job.id, _run_llm_test(request.app.state.session_factory, job.id, body.models))
    return JobAccepted(job_id=job.id)


async def _latest(session, kind: str) -> LatestTest | None:
    job = (
        await session.scalars(
            select(Job)
            .where(Job.kind == kind, Job.status == "done")
            .order_by(Job.finished_at.desc())
            .limit(1)
        )
    ).first()
    return LatestTest(result=job.result_json, finished_at=job.finished_at) if job else None


@router.get("/llm/test/latest", response_model=LatestTests)
async def latest_tests(session: SessionDep) -> LatestTests:
    """N-08d 設定頁載入時顯示上次的測試表。"""
    return LatestTests(
        llm_test=await _latest(session, LLM_TEST_KIND),
        brain_test=await _latest(session, BRAIN_TEST_KIND),
    )
