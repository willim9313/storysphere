# Partial Analysis / Three-State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let gather-based deep analyses (character, event) distinguish complete / partial / not-analyzed, keep partial results cached without auto-retry, and support a one-click "retry failed parts" that reuses the cached gate (CEP/EEP) and succeeded parts.

**Architecture:** A reusable `gather_parts` helper runs named sub-step coroutines tolerating individual failures and reports which parts failed. Result models carry `failed_parts`; status is derived (empty=complete, non-empty=partial, no cache=none). The cache-first agent gains a `retry_parts` path that re-runs only failed parts against the cached result.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, pytest, `uv`; React + TypeScript frontend (types generated from OpenAPI).

## Global Constraints

- Package manager: `uv` (`uv add`), never `pip install`.
- Pydantic models in `domain/` / `services/` use snake_case JSON; `api/schemas/` use `alias_generator=to_camel` (camelCase).
- Frontend API types come only from `frontend/src/api/generated.ts`; run `npm run gen:types` (in `frontend/`) after any Pydantic/endpoint change.
- After API endpoint changes, update `docs/API_CONTRACT.md` and tag the commit `[api-contract updated]`.
- Tests: pure-function unit tests (no fixtures), API tests use `tests/api/conftest.py` `client`, service tests use real SQLite + `tmp_path`. `AsyncMock.side_effect` uses sync functions unless `await` is needed. Use `uuid4()` for task IDs (global `task_store` singleton).
- Verify before commit: `ruff check src/` and `cd frontend && npm run lint` — no new errors.
- `failed_parts` is backward-compatible: absent/empty in old cache entries means `complete`.

---

## Task A: `gather_parts` helper + `failed_parts` on result models

**Files:**
- Create: `src/core/gather_parts.py`
- Create: `tests/core/test_gather_parts.py`
- Modify: `src/services/analysis_models.py` (add `failed_parts` to `CharacterAnalysisResult` ~line 68, `EventAnalysisResult` ~line 152)

**Interfaces:**
- Produces: `async def gather_parts(parts: dict[str, Awaitable]) -> tuple[dict[str, Any], list[str]]` — runs each awaitable with `return_exceptions=True`; returns `(results_by_name, failed_part_names)` where `results_by_name` contains only succeeded parts and `failed_part_names` preserves `parts` insertion order.
- Produces: `CharacterAnalysisResult.failed_parts: list[str]` and `EventAnalysisResult.failed_parts: list[str]`, both defaulting to `[]`.

- [ ] **Step 1: Write the failing test**

```python
# tests/core/test_gather_parts.py
import asyncio
import pytest
import sys
sys.path.insert(0, "src")
from core.gather_parts import gather_parts


async def _ok(v):
    return v


async def _boom():
    raise RuntimeError("fail")


class TestGatherParts:
    def test_all_succeed_returns_no_failures(self):
        async def run():
            return await gather_parts({"a": _ok(1), "b": _ok(2)})
        results, failed = asyncio.run(run())
        assert results == {"a": 1, "b": 2}
        assert failed == []

    def test_collects_failed_names_keeps_succeeded(self):
        async def run():
            return await gather_parts({"a": _ok(1), "b": _boom(), "c": _ok(3)})
        results, failed = asyncio.run(run())
        assert results == {"a": 1, "c": 3}
        assert failed == ["b"]

    def test_all_fail(self):
        async def run():
            return await gather_parts({"x": _boom(), "y": _boom()})
        results, failed = asyncio.run(run())
        assert results == {}
        assert failed == ["x", "y"]

    def test_empty(self):
        async def run():
            return await gather_parts({})
        results, failed = asyncio.run(run())
        assert results == {} and failed == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/core/test_gather_parts.py -v --no-cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'core.gather_parts'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/core/gather_parts.py
"""Run named sub-step coroutines, tolerating individual failures.

Single source of truth for the "gather but remember which parts failed"
pattern used by gather-based analyses (character, event, future modules).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable

logger = logging.getLogger(__name__)


async def gather_parts(
    parts: dict[str, Awaitable],
) -> tuple[dict[str, Any], list[str]]:
    """Await each part; return (succeeded results by name, failed names).

    Failures are swallowed (logged) so one bad part doesn't sink the rest.
    ``failed`` preserves ``parts`` insertion order.
    """
    names = list(parts.keys())
    outcomes = await asyncio.gather(*parts.values(), return_exceptions=True)
    results: dict[str, Any] = {}
    failed: list[str] = []
    for name, outcome in zip(names, outcomes):
        if isinstance(outcome, Exception):
            logger.warning("gather_parts: part %s failed: %s", name, outcome)
            failed.append(name)
        else:
            results[name] = outcome
    return results, failed
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/core/test_gather_parts.py -v --no-cov`
Expected: PASS (4 tests)

- [ ] **Step 5: Add `failed_parts` to result models**

In `src/services/analysis_models.py`, add to `CharacterAnalysisResult` (after `coverage`, before `analyzed_at`):

```python
    failed_parts: list[str] = Field(
        default_factory=list,
        description="Sub-step parts that failed (empty = complete)",
    )
```

Add the identical field to `EventAnalysisResult` (after `coverage`, before `analyzed_at`).

- [ ] **Step 6: Verify models still import and validate**

Run: `python -c "import sys; sys.path.insert(0,'src'); from services.analysis_models import CharacterAnalysisResult, EventAnalysisResult; print('ok')"`
Expected: `ok`

- [ ] **Step 7: Commit**

```bash
git add src/core/gather_parts.py tests/core/test_gather_parts.py src/services/analysis_models.py
git commit -m "feat(analysis): add gather_parts helper + failed_parts on result models"
```

---

## Task B: character pipeline — named parts, `failed_parts`, partial re-run

**Files:**
- Modify: `src/services/analysis_service.py` (`analyze_character` ~267-363; add `_character_parts` helper)
- Modify: `src/agents/analysis_agent.py` (`analyze_character` ~56-117)
- Test: `tests/services/test_analysis_partial.py` (new)

**Interfaces:**
- Consumes: `gather_parts` (Task A); `CharacterAnalysisResult.failed_parts`.
- Produces (service): `AnalysisService.analyze_character(..., retry_parts: list[str] | None = None, base_result: CharacterAnalysisResult | None = None)`. When `retry_parts` and `base_result` are given, CEP is reused from `base_result.cep`, only the named parts are recomputed, results merged into `base_result`, and `failed_parts` recomputed.
- Produces (agent): `AnalysisAgent.analyze_character(..., retry_parts: list[str] | None = None)`. When `retry_parts` is set, loads the cached result as `base_result`, calls the service in partial mode, and re-caches.
- Part names: `"archetype:<framework>"` (one per framework), `"arc"`, `"profile"`.

- [ ] **Step 1: Write the failing test**

```python
# tests/services/test_analysis_partial.py
import asyncio
import sys
from unittest.mock import AsyncMock
import pytest
sys.path.insert(0, "src")
from services.analysis_models import (
    CharacterAnalysisResult, CEPResult, CharacterProfile,
    ArchetypeResult, ArcSegment, CoverageMetrics,
)


def _cep():
    return CEPResult(actions=["a"], traits=["t"], relations=[])


def _service():
    from services.analysis_service import AnalysisService
    svc = AnalysisService.__new__(AnalysisService)
    svc._kg_service = None
    # stub the per-part coroutines
    svc._extract_cep = AsyncMock(return_value=_cep())
    svc._compute_coverage = lambda cep: CoverageMetrics()
    return svc


class TestCharacterPartialFailure:
    def test_archetype_failure_marks_failed_parts_keeps_others(self):
        svc = _service()
        svc._classify_archetype = AsyncMock(side_effect=RuntimeError("429"))
        svc._generate_character_arc = AsyncMock(return_value=[ArcSegment(
            chapter_range="1-2", phase="Setup", description="d")])
        svc._generate_profile = AsyncMock(return_value=CharacterProfile(summary="s"))

        result = asyncio.run(svc.analyze_character(
            entity_name="Bob", document_id="doc1",
            archetype_frameworks=["jung"], language="en"))

        assert result.failed_parts == ["archetype:jung"]
        assert result.profile.summary == "s"     # succeeded part kept
        assert result.archetypes == []           # failed part empty

    def test_retry_parts_reuses_cep_and_succeeded(self):
        svc = _service()
        # base result: archetype failed previously, profile already good
        base = CharacterAnalysisResult(
            entity_id="Bob", entity_name="Bob", document_id="doc1",
            profile=CharacterProfile(summary="kept"), cep=_cep(),
            archetypes=[], arc=[], coverage=CoverageMetrics(),
            failed_parts=["archetype:jung"])
        svc._classify_archetype = AsyncMock(return_value=ArchetypeResult(
            framework="jung", primary="hero", confidence=0.8))
        # these must NOT be called on retry
        svc._generate_profile = AsyncMock()
        svc._generate_character_arc = AsyncMock()

        result = asyncio.run(svc.analyze_character(
            entity_name="Bob", document_id="doc1",
            archetype_frameworks=["jung"], language="en",
            retry_parts=["archetype:jung"], base_result=base))

        svc._extract_cep.assert_not_called()         # CEP reused
        svc._generate_profile.assert_not_called()    # succeeded part untouched
        assert result.failed_parts == []
        assert result.archetypes[0].primary == "hero"
        assert result.profile.summary == "kept"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/services/test_analysis_partial.py -v --no-cov`
Expected: FAIL — `analyze_character() got an unexpected keyword argument 'retry_parts'` (and the partial-failure test fails because `failed_parts` is not populated).

- [ ] **Step 3: Refactor `analyze_character` to named parts + retry**

In `src/services/analysis_service.py`, add a helper and rewrite the body of `analyze_character`. Replace the block from `# Step 1: Extract CEP` (~303) through the `return CharacterAnalysisResult(...)` (~363) with:

```python
        # Resolve entity (unchanged, keep existing lines above)

        if retry_parts and base_result is not None:
            cep = base_result.cep
        else:
            if progress_callback:
                progress_callback(5, "extracting character evidence profile (CEP)")
            cep = await self._extract_cep(entity_name, document_id, language)

        wanted = self._character_parts(entity_name, cep, archetype_frameworks, language)
        if retry_parts is not None:
            wanted = {k: v for k, v in wanted.items() if k in retry_parts}

        if progress_callback:
            progress_callback(30, "analyzing archetype, arc, and profile")
        from core.gather_parts import gather_parts  # noqa: PLC0415
        results, failed = await gather_parts(wanted)

        if base_result is not None:
            archetypes = list(base_result.archetypes)
            arc = list(base_result.arc)
            profile = base_result.profile
        else:
            archetypes, arc, profile = [], [], CharacterProfile(summary="")

        for name, value in results.items():
            if name.startswith("archetype:"):
                archetypes = [a for a in archetypes if f"archetype:{a.framework}" != name]
                archetypes.append(value)
            elif name == "arc":
                arc = value
            elif name == "profile":
                profile = value

        if base_result is not None:
            prior = [p for p in base_result.failed_parts if p not in (retry_parts or [])]
            failed_parts = prior + failed
        else:
            failed_parts = failed

        coverage = self._compute_coverage(cep)
        return CharacterAnalysisResult(
            entity_id=entity_id,
            entity_name=entity_name,
            document_id=document_id,
            profile=profile,
            cep=cep,
            archetypes=archetypes,
            arc=arc,
            coverage=coverage,
            failed_parts=failed_parts,
        )

    def _character_parts(self, entity_name, cep, archetype_frameworks, language):
        """Map part-name → coroutine for the parallel sub-steps."""
        parts = {
            f"archetype:{fw}": self._classify_archetype(cep, fw, language)
            for fw in archetype_frameworks
        }
        parts["arc"] = self._generate_character_arc(cep, language)
        parts["profile"] = self._generate_profile(entity_name, cep, language)
        return parts
```

Update the `analyze_character` signature (~267) to add the two params:

```python
    async def analyze_character(
        self,
        entity_name: str,
        document_id: str,
        archetype_frameworks: list[str] | None = None,
        language: str = "en",
        progress_callback: Callable[[int, str], None] | None = None,
        retry_parts: list[str] | None = None,
        base_result: "CharacterAnalysisResult | None" = None,
    ) -> CharacterAnalysisResult:
```

Note: keep the existing `entity_id` resolution block (the `if self._kg_service is not None` lines) before the CEP step.

- [ ] **Step 4: Run service tests to verify they pass**

Run: `python -m pytest tests/services/test_analysis_partial.py -v --no-cov`
Expected: PASS (2 tests)

- [ ] **Step 5: Add `retry_parts` path to the agent**

In `src/agents/analysis_agent.py` `analyze_character` (~56), add `retry_parts: list[str] | None = None` to the signature, and before the existing cache-first block insert a partial-mode branch:

```python
        # Partial re-run: reuse cached result, recompute only failed parts
        if retry_parts and self._cache is not None:
            cached = await self._cache.get(cache_key)
            base = (
                CharacterAnalysisResult.model_validate(cached)
                if cached is not None else None
            )
            result = await self._service.analyze_character(
                entity_name=entity_name,
                document_id=document_id,
                archetype_frameworks=archetype_frameworks,
                language=language,
                progress_callback=progress_callback,
                retry_parts=retry_parts,
                base_result=base,
            )
            await self._cache.set(cache_key, result.model_dump(mode="json"))
            return result
```

(Place it right after `cache_key = AnalysisCache.make_key(...)` and before the `# 1. Check cache` block.)

- [ ] **Step 6: Write agent partial test + run**

```python
# append to tests/services/test_analysis_partial.py
class TestAgentPartial:
    def test_agent_retry_loads_cache_and_recaches(self):
        from agents.analysis_agent import AnalysisAgent
        agent = AnalysisAgent.__new__(AnalysisAgent)
        cached = {
            "entity_id": "Bob", "entity_name": "Bob", "document_id": "doc1",
            "profile": {"summary": "kept"}, "cep": {"actions": [], "traits": [], "relations": []},
            "archetypes": [], "arc": [], "coverage": {}, "failed_parts": ["arc"],
        }
        agent._cache = AsyncMock()
        agent._cache.get = AsyncMock(return_value=cached)
        agent._service = AsyncMock()
        from services.analysis_models import CharacterAnalysisResult, CharacterProfile, CEPResult, CoverageMetrics
        agent._service.analyze_character = AsyncMock(return_value=CharacterAnalysisResult(
            entity_id="Bob", entity_name="Bob", document_id="doc1",
            profile=CharacterProfile(summary="kept"), cep=CEPResult(),
            archetypes=[], arc=[{"chapter_range": "1", "phase": "p", "description": "d"}],
            coverage=CoverageMetrics(), failed_parts=[]))

        result = asyncio.run(agent.analyze_character(
            entity_name="Bob", document_id="doc1", retry_parts=["arc"]))

        agent._cache.set.assert_awaited_once()
        assert result.failed_parts == []
```

Run: `python -m pytest tests/services/test_analysis_partial.py -v --no-cov`
Expected: PASS (3 tests)

- [ ] **Step 7: Regression + commit**

Run: `python -m pytest tests/services/test_analysis_service.py tests/api/test_analysis.py --no-cov -q`
Expected: no new failures.

```bash
git add src/services/analysis_service.py src/agents/analysis_agent.py tests/services/test_analysis_partial.py
git commit -m "feat(analysis): character pipeline failed_parts + retry_parts partial re-run"
```

---

## Task C: event pipeline — named parts, `failed_parts`, partial re-run

**Files:**
- Modify: `src/services/analysis_service.py` (`analyze_event` ~617-689; add `_event_parts`)
- Modify: `src/agents/analysis_agent.py` (`analyze_event` ~125-190)
- Test: `tests/services/test_analysis_partial.py` (append event cases)

**Interfaces:**
- Consumes: `gather_parts`; `EventAnalysisResult.failed_parts`.
- Produces (service): `analyze_event(..., retry_parts: list[str] | None = None, base_result: EventAnalysisResult | None = None)`. Part names: `"causality"`, `"impact"`.
- Produces (agent): `analyze_event(..., retry_parts: list[str] | None = None)` mirroring Task B Step 5.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/services/test_analysis_partial.py
class TestEventPartialFailure:
    def test_impact_failure_marks_failed_parts(self):
        from services.analysis_service import AnalysisService
        from services.analysis_models import (
            EventEvidenceProfile, CausalityAnalysis, EventCoverageMetrics, EventSummary)
        svc = AnalysisService.__new__(AnalysisService)
        ev = type("E", (), {"title": "T"})()
        svc._kg_service = AsyncMock()
        svc._kg_service.get_event = AsyncMock(return_value=ev)
        svc._extract_eep = AsyncMock(return_value=EventEvidenceProfile(
            state_before="", state_after=""))
        svc._analyze_causality = AsyncMock(return_value=CausalityAnalysis())
        svc._analyze_impact = AsyncMock(side_effect=RuntimeError("429"))
        svc._generate_event_summary = AsyncMock(return_value=EventSummary(summary="s") if hasattr(__import__("services.analysis_models", fromlist=["EventSummary"]), "EventSummary") else None)
        svc._compute_event_coverage = lambda eep: EventCoverageMetrics()

        result = asyncio.run(svc.analyze_event(
            event_id="e1", document_id="doc1", language="en"))
        assert result.failed_parts == ["impact"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/services/test_analysis_partial.py::TestEventPartialFailure -v --no-cov`
Expected: FAIL — `failed_parts` not populated / unexpected kwarg.

- [ ] **Step 3: Refactor `analyze_event`**

In `src/services/analysis_service.py`, replace the parallel block (~643-688) with named parts. Add params to the signature (mirroring Task B). Replace from `# causality and impact are independent` through the `return EventAnalysisResult(...)`:

```python
        if retry_parts and base_result is not None:
            eep = base_result.eep
        else:
            if progress_callback:
                progress_callback(5, "extracting event evidence profile (EEP)")
            eep = await self._extract_eep(event, document_id, language)

        wanted = {
            "causality": self._analyze_causality(eep, event, language),
            "impact": self._analyze_impact(eep, event, language),
        }
        if retry_parts is not None:
            wanted = {k: v for k, v in wanted.items() if k in retry_parts}

        if progress_callback:
            progress_callback(30, "analyzing causality and impact")
        from core.gather_parts import gather_parts  # noqa: PLC0415
        results, failed = await gather_parts(wanted)

        if base_result is not None:
            causality = base_result.causality
            impact = base_result.impact
        else:
            causality = CausalityAnalysis(root_cause="", causal_chain=[], trigger_event_ids=[], chain_summary="")
            impact = ImpactAnalysis(affected_participant_ids=[], participant_impacts=[], relation_changes=[], subsequent_event_ids=[], impact_summary="")
        causality = results.get("causality", causality)
        impact = results.get("impact", impact)

        if base_result is not None:
            prior = [p for p in base_result.failed_parts if p not in (retry_parts or [])]
            failed_parts = prior + failed
        else:
            failed_parts = failed

        if progress_callback:
            progress_callback(75, "generating event summary")
        event_summary = await self._generate_event_summary(event, eep, causality, impact, language)
        coverage = self._compute_event_coverage(eep)
        return EventAnalysisResult(
            event_id=event_id, title=event.title, document_id=document_id,
            eep=eep, causality=causality, impact=impact, summary=event_summary,
            coverage=coverage, analyzed_at=datetime.now(timezone.utc),
            failed_parts=failed_parts,
        )
```

Add to the signature (~614):

```python
        retry_parts: list[str] | None = None,
        base_result: "EventAnalysisResult | None" = None,
```

- [ ] **Step 4: Run event test to verify pass**

Run: `python -m pytest tests/services/test_analysis_partial.py::TestEventPartialFailure -v --no-cov`
Expected: PASS

- [ ] **Step 5: Add agent `retry_parts` path for event**

In `src/agents/analysis_agent.py` `analyze_event` (~125), add `retry_parts: list[str] | None = None`, and after `cache_key = f"event:..."` insert:

```python
        if retry_parts and self._cache is not None:
            cached = await self._cache.get(cache_key)
            base = (
                EventAnalysisResult.model_validate(cached)
                if cached is not None else None
            )
            result = await self._service.analyze_event(
                event_id=event_id, document_id=document_id, language=language,
                progress_callback=progress_callback,
                retry_parts=retry_parts, base_result=base,
            )
            await self._cache.set(cache_key, result.model_dump(mode="json"))
            return result
```

- [ ] **Step 6: Regression + commit**

Run: `python -m pytest tests/services/test_analysis_partial.py tests/services/test_event_analysis.py --no-cov -q`
Expected: no new failures.

```bash
git add src/services/analysis_service.py src/agents/analysis_agent.py tests/services/test_analysis_partial.py
git commit -m "feat(analysis): event pipeline failed_parts + retry_parts partial re-run"
```

---

## Task D: API — three-state exposure + retryFailed mode + contract

**Files:**
- Modify: `src/api/schemas/books.py` (`CharacterAnalysisDetailResponse`: add `status`, `failed_parts`; trigger request: add `mode`)
- Modify: `src/api/routers/books.py` (`get_entity_analysis` ~1449; `trigger_entity_analysis` ~1515 / `_run_entity_analysis` ~209; event equivalents `get_event_analysis` ~1858 / `trigger_event_analysis` ~1824)
- Modify: `docs/API_CONTRACT.md`
- Test: `tests/api/test_analysis_partial_api.py` (new)

**Interfaces:**
- Consumes: agent `retry_parts`; result `failed_parts`.
- Produces: GET responses gain `status: "complete" | "partial"` and `failedParts: list[str]`. Trigger endpoints accept optional JSON body `{"mode": "full" | "retryFailed"}` (default `full`). For `retryFailed`, the router reads the cached result's `failed_parts` and passes them as `retry_parts`; for `full` it passes `force_refresh=True`.

- [ ] **Step 1: Write the failing API test**

```python
# tests/api/test_analysis_partial_api.py
import sys
sys.path.insert(0, "src")
from services.analysis_models import (
    CharacterAnalysisResult, CharacterProfile, CEPResult, CoverageMetrics)


def _partial_cached():
    return CharacterAnalysisResult(
        entity_id="ent-1", entity_name="Bob", document_id="book-1",
        profile=CharacterProfile(summary="s"), cep=CEPResult(),
        archetypes=[], arc=[], coverage=CoverageMetrics(),
        failed_parts=["archetype:jung"]).model_dump(mode="json")


class TestEntityAnalysisStatus:
    def test_partial_result_exposes_status_and_failed_parts(self, analysis_client, mock_cache, mock_kg):
        mock_kg.get_entity.return_value = type("E", (), {"id": "ent-1", "name": "Bob"})()
        mock_cache.get.return_value = _partial_cached()
        resp = analysis_client.get("/api/v1/books/book-1/entities/ent-1/analysis")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "partial"
        assert body["failedParts"] == ["archetype:jung"]
```

Add a local fixture in this test file extending `client` with `mock_cache` (per TESTING.md — do not edit shared conftest):

```python
import pytest
from unittest.mock import AsyncMock

@pytest.fixture
def analysis_client(mock_kg, mock_doc, mock_vector, mock_analysis_agent, mock_chat_agent):
    from api.main import create_app
    from api import deps
    from fastapi.testclient import TestClient
    app = create_app()
    mock_cache = AsyncMock()
    app.dependency_overrides[deps.get_analysis_cache] = lambda: mock_cache
    # carry mock_cache out via app state for the test
    app.state._mock_cache = mock_cache
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def mock_cache(analysis_client):
    return analysis_client.app.state._mock_cache
```

(Confirm the dependency name `deps.get_analysis_cache` matches `AnalysisCacheDep` in `src/api/deps.py`; adjust if different.)

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/api/test_analysis_partial_api.py -v --no-cov`
Expected: FAIL — response has no `status` / `failedParts`.

- [ ] **Step 3: Add response fields to the schema**

In `src/api/schemas/books.py`, add to `CharacterAnalysisDetailResponse`:

```python
    status: str = "complete"          # "complete" | "partial"
    failed_parts: list[str] = []
```

(camelCase `failedParts` is produced by the existing `alias_generator=to_camel`.)

- [ ] **Step 4: Populate them in `get_entity_analysis`**

In `src/api/routers/books.py` `get_entity_analysis` (~1467), add to the `CharacterAnalysisDetailResponse(...)` construction:

```python
                status="partial" if result.failed_parts else "complete",
                failed_parts=result.failed_parts,
```

- [ ] **Step 5: Run to verify pass**

Run: `python -m pytest tests/api/test_analysis_partial_api.py -v --no-cov`
Expected: PASS

- [ ] **Step 6: Add `mode` to the trigger endpoint**

Define a request body schema in `src/api/schemas/books.py`:

```python
class AnalyzeTriggerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    mode: Literal["full", "retryFailed"] = "full"
```

In `trigger_entity_analysis` (~1515) accept `body: AnalyzeTriggerRequest = AnalyzeTriggerRequest()` and resolve parts:

```python
    retry_parts = None
    force_refresh = False
    if body.mode == "retryFailed":
        cache_key = AnalysisCache.make_key("character", book_id, entity.name)
        cached = await cache.get(cache_key)
        if cached:
            retry_parts = CharacterAnalysisResult.model_validate(cached).failed_parts
    else:
        force_refresh = True
```

Pass `retry_parts=retry_parts, force_refresh=force_refresh` through `_run_entity_analysis` → `agent.analyze_character`. (Thread the two values into `_run_entity_analysis`'s signature and its `agent.analyze_character(...)` call ~ line 209+.)

- [ ] **Step 7: Write trigger test + run**

```python
# append to tests/api/test_analysis_partial_api.py
class TestRetryFailedMode:
    def test_retry_failed_reads_cache_and_passes_retry_parts(self, analysis_client, mock_cache, mock_kg, mock_analysis_agent):
        mock_kg.get_entity.return_value = type("E", (), {"id": "ent-1", "name": "Bob"})()
        mock_cache.get.return_value = _partial_cached()
        resp = analysis_client.post(
            "/api/v1/books/book-1/entities/ent-1/analyze", json={"mode": "retryFailed"})
        assert resp.status_code in (200, 202)
        # background task scheduled with retry_parts derived from cache
        args, kwargs = mock_analysis_agent.analyze_character.call_args
        assert kwargs.get("retry_parts") == ["archetype:jung"]
```

Run: `python -m pytest tests/api/test_analysis_partial_api.py -v --no-cov`
Expected: PASS (adjust assertion to how `_run_entity_analysis` invokes the agent; if it calls inside a background task, assert via the agent mock after the request).

- [ ] **Step 8: Mirror for event endpoints**

Apply Steps 3-6 to the event response (`get_event_analysis` ~1858, its response schema) and `trigger_event_analysis` ~1824 with cache key `f"event:{book_id}:{event_id}"`, part source `EventAnalysisResult`.

- [ ] **Step 9: Update API contract**

In `docs/API_CONTRACT.md`, under the entity/event analysis sections: add `status` + `failedParts` to the response types, and document the `mode` body param (`full` | `retryFailed`) on the analyze trigger endpoints.

- [ ] **Step 10: Regen types, lint, commit**

```bash
cd frontend && npm run gen:types && cd ..
ruff check src/api/routers/books.py src/api/schemas/books.py
git add src/api/routers/books.py src/api/schemas/books.py docs/API_CONTRACT.md frontend/src/api/generated.ts tests/api/test_analysis_partial_api.py
git commit -m "feat(api): three-state status + retryFailed mode for character/event analysis [api-contract updated]"
```

---

## Task E: frontend — three-state UX + task center partial

**Files:**
- Modify: `frontend/src/components/analysis/sections/PersonaPane.tsx` (~29-37)
- Modify: `frontend/src/pages/CharacterAnalysisPage.tsx` (regenerate handler / partial banner)
- Modify: `frontend/src/api/analysis.ts` (`triggerEntityAnalysis` to send `mode`)
- Modify: `frontend/src/components/tasks/TaskRow.tsx` (partial label)

**Interfaces:**
- Consumes: GET response `status` / `failedParts`; task `result.failed_parts`.
- Produces: a `mode` param on `triggerEntityAnalysis`; a "重試失敗部分" action; "生成失敗，可重試" vs "未生成" distinction.

- [ ] **Step 1: Add `mode` to the API call**

In `frontend/src/api/analysis.ts` `triggerEntityAnalysis`:

```typescript
export function triggerEntityAnalysis(
  bookId: string,
  entityId: string,
  mode: 'full' | 'retryFailed' = 'full',
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.triggerEntityAnalysis(bookId, entityId);
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/entities/${entityId}/analyze`,
    { method: 'POST', body: JSON.stringify({ mode }) },
  );
}
```

- [ ] **Step 2: Distinguish failed vs not-generated in PersonaPane**

In `PersonaPane.tsx`, compute whether this framework's part failed and branch the placeholder:

```typescript
  const failed = (data.failedParts ?? []).includes(`archetype:${framework}`);
  const archetypeTitle = archetype
    ? framework === 'jung'
      ? t('character.persona.archetypeLabelJung', { name: archetype.primary })
      : t('character.persona.archetypeLabelSchmidt', { name: archetype.primary })
    : t(failed ? 'character.persona.archetypeFailed' : 'character.persona.archetypeNotGenerated');
```

Add i18n keys `character.persona.archetypeFailed` = `"生成失敗，可重試"` (zh-TW) / `"Generation failed — retry"` (en) in `frontend/src/i18n/locales/*/analysis.json`.

- [ ] **Step 3: Add the one-click retry action**

In `CharacterAnalysisPage.tsx`, when `entityAnalysis?.status === 'partial'`, render a "重試失敗部分" button whose handler calls `triggerEntityAnalysis(bookId!, entityId, 'retryFailed')` then polls the returned task (reuse the existing `useTaskPolling` / mutation pattern at ~88).

```typescript
  const retryFailedMut = useMutation({
    mutationFn: (id: string) => triggerEntityAnalysis(bookId!, id, 'retryFailed'),
    onSuccess: (data) => setGenTaskId(data.taskId),
  });
```

- [ ] **Step 4: Task center partial label**

In `frontend/src/components/tasks/TaskRow.tsx`, treat a done task whose `result.failed_parts` is non-empty as partial:

```typescript
  const failedParts = (task.result as { failed_parts?: unknown } | null | undefined)?.failed_parts;
  const isPartial = task.status === 'done' && Array.isArray(failedParts) && failedParts.length > 0;
```

For `isDone`, render "部分完成" with `var(--color-warning)` (amber) when `isPartial`, else the existing relative-time "已完成". Set the status dot to `var(--color-warning)` when `isPartial`.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd frontend
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/components/analysis/sections/PersonaPane.tsx src/pages/CharacterAnalysisPage.tsx src/api/analysis.ts src/components/tasks/TaskRow.tsx
cd ..
git add frontend/src/components/analysis/sections/PersonaPane.tsx frontend/src/pages/CharacterAnalysisPage.tsx frontend/src/api/analysis.ts frontend/src/components/tasks/TaskRow.tsx frontend/src/i18n/locales
git commit -m "feat(frontend): partial-analysis three-state UX + task center 部分完成"
```

---

## Notes for the implementer

- `EventSummary` / `ImpactAnalysis` exact field names: confirm against `src/services/analysis_models.py` before writing the event empty-defaults (Task C Step 3) — copy the field set already used in the current `analyze_event` empty branches.
- The event page may be `EventAnalysisPage.tsx`; apply the Task E PersonaPane-equivalent distinction to its causality/impact sections (`causality` / `impact` part names) if it surfaces "not generated" placeholders.
- Symbol / narrative: **no changes** — structurally never partial (spec §2).
