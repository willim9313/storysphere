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
    BrainSettingsIn,
    BrainSettingsOut,
    BrainTestIn,
    ClaudeCodeBrainOut,
    DeepAgentsBrain,
    LatestBrainTest,
    LatestTest,
    LatestTests,
    LlmSettingsIn,
    LlmSettingsOut,
    LlmTestIn,
    ModelOut,
    ProviderOut,
    TaskOut,
)
from storysphere.gateway.brain_test import run_brain_test
from storysphere.llm.settings import (
    DEFAULT_SETTINGS_PATH,
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


async def _latest_job(session, kind: str) -> Job | None:
    return (
        await session.scalars(
            select(Job)
            .where(Job.kind == kind, Job.status == "done")
            .order_by(Job.finished_at.desc())
            .limit(1)
        )
    ).first()


@router.get("/llm/test/latest", response_model=LatestTests)
async def latest_tests(session: SessionDep) -> LatestTests:
    """N-08d 設定頁載入時顯示上次的測試表。"""
    llm = await _latest_job(session, LLM_TEST_KIND)
    brain = await _latest_job(session, BRAIN_TEST_KIND)
    return LatestTests(
        llm_test=LatestTest(result=llm.result_json, finished_at=llm.finished_at) if llm else None,
        brain_test=(
            LatestBrainTest(result=brain.result_json, finished_at=brain.finished_at)
            if brain
            else None
        ),
    )


# ---- N-08e–g 大腦（05 §5、§6）----

BRAIN_TASK = "brain"
DEFAULT_LAUNCH_COMMAND = "npx -y @agentclientprotocol/claude-agent-acp"


def _raw_brain() -> dict[str, Any]:
    """設定檔的 `brain:` 區塊（`LlmSettings` 不管它）；檔案不存在時讀預設檔。"""
    target = settings_path()
    if not target.exists():
        target = DEFAULT_SETTINGS_PATH
    loaded = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
    brain = loaded.get("brain") if isinstance(loaded, dict) else None
    return brain if isinstance(brain, dict) else {}


async def _claude_code_available(session) -> bool | None:
    jobs = await session.scalars(
        select(Job)
        .where(Job.kind == BRAIN_TEST_KIND, Job.status == "done")
        .order_by(Job.finished_at.desc())
    )
    for job in jobs:
        result = job.result_json or {}
        if result.get("backend") == "claude-code":
            return all(check.get("ok") for check in result.get("checks", []))
    return None


@router.get("/brain", response_model=BrainSettingsOut)
async def get_brain_settings(session: SessionDep) -> BrainSettingsOut:
    """N-08e 大腦設定；deepagents 的模型就是 `tasks.brain.model`。"""
    brain = _raw_brain()
    task = load_settings().tasks.get(BRAIN_TASK)
    return BrainSettingsOut(
        default_backend=brain.get("default_backend", "none"),
        deepagents=DeepAgentsBrain(model=task.model if task else None),
        claude_code=ClaudeCodeBrainOut(
            launch_command=(brain.get("claude_code") or {}).get(
                "launch_command", DEFAULT_LAUNCH_COMMAND
            ),
            available=await _claude_code_available(session),
        ),
    )


@router.put("/brain", response_model=BrainSettingsOut)
async def put_brain_settings(body: BrainSettingsIn, session: SessionDep) -> BrainSettingsOut:
    """N-08f 更新大腦設定，寫進 `var/settings.yaml`；沒有任何登入欄位（05 §5.2）。"""
    settings = load_settings()
    model = body.deepagents.model
    if model is not None and model not in settings.models:
        raise validation_error(f"deepagents.model: unknown model {model!r}")
    if not body.claude_code.launch_command.strip():
        raise validation_error("claudeCode.launchCommand: must not be empty")
    data: dict[str, Any] = {
        "brain": {
            "default_backend": body.default_backend,
            "claude_code": {"launch_command": body.claude_code.launch_command},
        }
    }
    if model is not None:
        # 整份三層設定一起寫：`var/settings.yaml` 原本不存在時，只寫 tasks 會丟掉 providers／models。
        dumped = settings.model_dump(mode="json", exclude_none=True)
        current = dumped["tasks"].get(BRAIN_TASK, {})
        dumped["tasks"][BRAIN_TASK] = {**current, "model": model}
        data |= dumped
    _write_yaml(data)
    return await get_brain_settings(session)


async def _run_brain_test(request: Request, job_id: str, backend: str) -> None:
    session_factory = request.app.state.session_factory
    async with session_factory() as session, session.begin():
        job = await session.get(Job, job_id)
        job.status, job.started_at = "running", datetime.now(UTC)
    try:
        result = await run_brain_test(request.app.state.gateway, backend)
    except Exception as exc:
        logger.exception("Brain test job %s failed", job_id)
        async with session_factory() as session, session.begin():
            job = await session.get(Job, job_id)
            job.status, job.error, job.error_kind = "error", str(exc), "internal"
            job.finished_at = datetime.now(UTC)
        return
    async with session_factory() as session, session.begin():
        job = await session.get(Job, job_id)
        job.result_json = result
        job.status, job.progress, job.finished_at = "done", 100, datetime.now(UTC)


@router.post("/brain/test", status_code=202, response_model=JobAccepted)
async def test_brain(
    body: BrainTestIn, session: SessionDep, tasks: JobTasksDep, request: Request
) -> JobAccepted:
    """N-08g 大腦測試（建 `brain_test` job）：開暫時 session，請大腦呼叫一次 `list_genre_elements`。"""
    job = Job(kind=BRAIN_TEST_KIND, title="大腦測試", status="pending",
              params_json={"backend": body.backend})  # fmt: skip
    session.add(job)
    await session.commit()
    tasks.spawn(job.id, _run_brain_test(request, job.id, body.backend))
    return JobAccepted(job_id=job.id)
