"""AnalysisService — LLM-based literary analysis.

Owns the LLM logic for generating insights and deep character analysis.
Tools delegate to this service.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from storysphere.core.token_callback import set_llm_service_context
from storysphere.core.tracing import update_span as _lf_update_span
from storysphere.core.utils.data_sanitizer import DataSanitizer
from storysphere.core.utils.output_extractor import extract_json_from_text

try:
    from langfuse import observe as _lf_observe
except ImportError:
    def _lf_observe(**_kw):  # type: ignore[misc]
        def _d(fn): return fn
        return _d

from storysphere.services.analysis_models import (
    ArchetypeResult,
    ArcSegment,
    CausalityAnalysis,
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
    EventAnalysisResult,
    EventCoverageMetrics,
    EventEvidenceProfile,
    EventImportance,
    EventSummary,
    ImpactAnalysis,
    ParticipantRole,
    ParticipantRoleType,
)

logger = logging.getLogger(__name__)


# ── CEP relation normalization ────────────────────────────────────────────────

# Canonical machine codes the CEP prompt enumerates for relations[].type.
# Mirrors the frontend RelationsPane TYPE_TOKEN map.
_CEP_RELATION_TYPES = {"enemy", "ally", "subordinate", "member", "other"}

# Known drift patterns from past LLM output: the zh-TW design labels.
_CEP_RELATION_ALIASES = {
    "敵人": "enemy",
    "盟友": "ally",
    "下屬": "subordinate",
    "成員": "member",
    "其他": "other",
}


def _normalize_cep_relations(raw: object) -> list[dict[str, str]]:
    """Validate and normalize LLM-produced CEP relations.

    Drops entries that are not dicts or lack a target; coerces any type
    string outside the canonical code set to "other" (lossless downgrade —
    the description keeps the nuance) instead of failing and re-burning the
    whole CEP call on retry.
    """
    if not isinstance(raw, list):
        return []
    normalized: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        target = str(item.get("target") or "").strip()
        if not target:
            continue
        rtype = str(item.get("type") or "").strip()
        canonical = _CEP_RELATION_ALIASES.get(rtype, rtype.lower())
        if canonical not in _CEP_RELATION_TYPES:
            logger.warning(
                "CEP relation type %r (target=%r) not canonical — coerced to 'other'",
                rtype,
                target,
            )
            canonical = "other"
        normalized.append({
            "target": target,
            "type": canonical,
            "description": str(item.get("description") or "").strip(),
        })
    return normalized


# ── Prompt Constants ──────────────────────────────────────────────────────────

_INSIGHT_SYSTEM_PROMPT = """\
You are a literary analysis expert. Given a topic and supporting context from
a novel's knowledge graph and text, generate a concise, insightful observation.

Guidelines:
- Be specific and reference the provided context.
- Keep the insight to 2-4 sentences.
- Focus on literary significance, thematic meaning, or narrative implications.
- If the context is insufficient, state what additional information would help.
"""

_CEP_SYSTEM_PROMPT = """\
You are a literary analysis expert extracting a Character Evidence Profile (CEP).
Given knowledge graph data, text passages, and keywords for a character,
extract structured evidence about the character.

Return a JSON object with these keys:
- "actions": list of key actions the character takes (strings)
- "traits": list of personality traits with brief evidence (strings)
- "relations": list of objects with "target", "type", "description".
  "type" MUST be exactly one of these machine codes: "enemy", "ally",
  "subordinate", "member", "other". Keep the code in English even when
  responding in another language; put any nuance (friendship, mentorship,
  family ties, rivalry...) into "description" instead.
- "key_events": list of objects with "event", "chapter", "significance"
- "quotes": list of notable quotes or dialogue (strings, max 5)

Be thorough but concise. Focus on what the evidence shows, not speculation.
"""

_ARCHETYPE_SYSTEM_PROMPT = """\
You are a literary archetype analyst. Given a character's evidence profile (CEP)
and a list of archetypes from the {framework} framework, classify the character.

Available archetypes:
{archetype_list}

Return a JSON object with:
- "primary": the archetype ID that best fits (string)
- "secondary": second-best archetype ID or null
- "confidence": float 0.0–1.0 indicating certainty
- "evidence": list of 2-4 strings explaining why these archetypes fit

Base your classification on concrete actions, traits, and relationships.
"""

_ARC_SYSTEM_PROMPT = """\
You are a literary analyst mapping a character's development arc.
Given a character's evidence profile (actions, traits, events across chapters),
identify the major phases of their development.

Return a JSON array of arc segments, each with:
- "chapter_range": string like "1-5"
- "phase": label (e.g. "Setup", "Rising Action", "Crisis", "Climax", "Resolution", "Transformation")
- "description": 1-2 sentence description of what happens in this phase

Order chronologically. Identify 3-6 segments.
"""

_PROFILE_SYSTEM_PROMPT = """\
You are a literary critic writing a concise character summary.
Given a character's evidence profile, write a ~120-word narrative summary
covering their role, personality, key relationships, and development arc.

Return a JSON object with a single key "summary" containing the text.
Write in third person, present tense. Be specific and insightful.
"""

_EEP_SYSTEM_PROMPT = """\
You are a literary analyst. Given a narrative event and supporting evidence,
extract a structured Event Evidence Profile.

Return JSON with exactly these keys:
{
  "state_before": str,
  "state_after": str,
  "causal_factors": [str, ...],
  "participant_roles": [
    {
      "entity_name": str,
      "role": "initiator"|"actor"|"reactor"|"victim"|"beneficiary",
      "impact_description": str
    }, ...
  ],
  "structural_role": str,
  "event_importance": "kernel"|"satellite",
  "thematic_significance": str,
  "key_quotes": [str, ...]
}

structural_role must be one of: Setup, Inciting Incident, Turning Point,
Escalation, Crisis, Climax, Resolution.

key_quotes: Extract 2-4 SHORT, vivid quotes (dialogue lines, key narrative
sentences) directly from the TEXT EVIDENCE that best capture this event's
emotional tone and significance. Each quote should be one sentence or
dialogue line, not a full paragraph. Prefer dialogue over narration.
"""

_CAUSALITY_SYSTEM_PROMPT = """\
You are a literary analyst specializing in narrative causality.
Given a narrative event and its evidence profile, construct the causal chain
that led to this event.

Return JSON:
{
  "root_cause": str,
  "causal_chain": [str, ...],
  "trigger_event_ids": [str],
  "chain_summary": str
}

trigger_event_ids must be a subset of the provided prior event IDs.
causal_chain should be 3-6 ordered steps.
chain_summary should be 2-3 sentences.
"""

_IMPACT_SYSTEM_PROMPT = """\
You are a literary analyst specializing in narrative consequences.
Given a narrative event and its evidence, analyze its impact on participants
and the story world.

Return JSON:
{
  "affected_participant_ids": [str],
  "participant_impacts": [str],
  "relation_changes": [str],
  "subsequent_event_ids": [str],
  "impact_summary": str
}

subsequent_event_ids must be a subset of the provided subsequent event IDs.
impact_summary should be 2-3 sentences.
"""

_EVENT_SUMMARY_SYSTEM_PROMPT = """\
You are a literary analyst. Write a vivid ~150-word narrative summary of
a story event, synthesizing its causes, participants, consequences, and
thematic meaning.

Return JSON:
{
  "summary": str
}

The summary must cover:
1. What happened and what changed (state transition)
2. Why it happened (causality)
3. Who was involved and in what roles
4. What it led to (consequences)
5. Its structural role in the story and thematic significance

Style requirements:
- Reference specific scenes, dialogue, or imagery from the KEY QUOTES when
  available — ground the summary in concrete textual details.
- AVOID generic template phrases such as "埋下伏筆", "預示著", "揭示了",
  "不僅…也…", "為後續…奠定基礎". Instead, describe the SPECIFIC consequences.
- Prefer concrete cause-and-effect over abstract commentary.
- Write in a style that is analytical yet engaging, not formulaic.
"""


class AnalysisService:
    """Generate literary analysis insights and deep character analysis via LLM."""

    def __init__(
        self,
        llm: Any = None,
        kg_service: Any = None,
        vector_service: Any = None,
        keyword_service: Any = None,
    ) -> None:
        self._llm = llm
        self._kg_service = kg_service
        self._vector_service = vector_service
        self._keyword_service = keyword_service

    def _get_llm(self, temperature: float | None = None):
        if self._llm is None:
            from storysphere.core.llm_client import get_llm_client  # noqa: PLC0415

            t = temperature if temperature is not None else 0.3
            self._llm = get_llm_client().get_with_local_fallback(temperature=t)
        return self._llm

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        """Append a language instruction to a system prompt."""
        from storysphere.core.language_detection import get_language_display_name  # noqa: PLC0415

        lang_name = get_language_display_name(language)
        return prompt + f"\nRespond in {lang_name}."

    # ── Public: generate_insight (Phase 3) ─────────────────────────────────────

    @_lf_observe(name="analysis.insight", as_type="chain", capture_input=False, capture_output=False)
    async def generate_insight(
        self, topic: str, context: str = "", language: str = "en"
    ) -> str:
        _lf_update_span(metadata={"topic": topic[:200], "language": language, "has_context": bool(context)})
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        llm = self._get_llm()
        prompt = self._localize_prompt(_INSIGHT_SYSTEM_PROMPT, language)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(
                content=f"Topic: {topic}\n\nContext:\n{context}" if context
                else f"Topic: {topic}\n\n(No additional context provided.)"
            ),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        logger.info("AnalysisService: generated insight for topic=%r  len=%d", topic, len(content))
        return content

    # ── Public: analyze_character (Phase 5) ────────────────────────────────────

    @_lf_observe(name="analysis.character", as_type="chain", capture_input=False, capture_output=False)
    async def analyze_character(
        self,
        entity_name: str,
        document_id: str,
        archetype_frameworks: list[str] | None = None,
        language: str = "en",
        progress_callback: Callable[[int, str], None] | None = None,
        retry_parts: list[str] | None = None,
        base_result: CharacterAnalysisResult | None = None,
    ) -> CharacterAnalysisResult:
        """Run full character analysis pipeline: CEP → archetypes → arc → profile.

        Args:
            entity_name: Character name.
            document_id: Source document ID.
            archetype_frameworks: Frameworks to classify (default: ['jung']).
            language: Language for archetype configs ('en' or 'zh').

        Returns:
            Complete CharacterAnalysisResult.
        """
        if archetype_frameworks is None:
            archetype_frameworks = ["jung"]

        _lf_update_span(metadata={
            "entity_name": entity_name,
            "document_id": document_id,
            "frameworks": archetype_frameworks,
            "language": language,
        })

        # Resolve entity
        entity_id = entity_name
        if self._kg_service is not None:
            entity = await self._kg_service.get_entity_by_name(entity_name)
            if entity is not None:
                entity_id = entity.id

        # Step 1: Extract CEP (must complete before steps 2-4).
        # On partial re-run, reuse the cached CEP instead of re-extracting.
        if retry_parts and base_result is not None:
            cep = base_result.cep
        else:
            if progress_callback:
                progress_callback(5, "extracting character evidence profile (CEP)")
            cep = await self._extract_cep(entity_name, document_id, language)

        # Steps 2, 3, 4: archetypes + arc + profile, as named parts.
        # Pass retry_parts so only the wanted coroutines are instantiated.
        wanted = self._character_parts(
            entity_name, cep, archetype_frameworks, language, only=retry_parts
        )

        if progress_callback:
            progress_callback(30, "analyzing archetype, arc, and profile")
        from storysphere.core.gather_parts import gather_parts  # noqa: PLC0415
        results, failed = await gather_parts(wanted)

        if base_result is not None:
            archetypes = list(base_result.archetypes)
            arc = list(base_result.arc)
            profile = base_result.profile
        else:
            archetypes, arc, profile = [], [], CharacterProfile(summary="")

        for name, value in results.items():
            if name.startswith("archetype:"):
                archetypes = [
                    a for a in archetypes if f"archetype:{a.framework}" != name
                ]
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

        # Step 5: Compute coverage metrics (pure computation)
        if progress_callback:
            progress_callback(85, "computing coverage metrics")
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

    def _character_parts(
        self, entity_name, cep, archetype_frameworks, language, only=None
    ):
        """Map part-name → coroutine for the parallel sub-steps.

        Coroutines are built lazily via factories so that ``only`` filtering
        never instantiates (and thus never has to await) unwanted parts.
        """
        factories = {
            f"archetype:{fw}": (lambda fw=fw: self._classify_archetype(cep, fw, language))
            for fw in archetype_frameworks
        }
        factories["arc"] = lambda: self._generate_character_arc(cep, language)
        factories["profile"] = lambda: self._generate_profile(entity_name, cep, language)
        return {
            name: make()
            for name, make in factories.items()
            if only is None or name in only
        }

    # ── Private: CEP Extraction ────────────────────────────────────────────────

    @_lf_observe(name="analysis.character.cep", as_type="chain", capture_input=False, capture_output=False)
    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _extract_cep(
        self, entity_name: str, document_id: str, language: str = "en"
    ) -> CEPResult:
        """Extract Character Evidence Profile from KG + vector + keywords + LLM."""
        _lf_update_span(metadata={"entity_name": entity_name, "document_id": document_id, "language": language})
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        # --- Parallel data gathering: KG, vector search, keywords ---

        async def gather_kg() -> list[str]:
            if self._kg_service is None:
                return []
            entity = await self._kg_service.get_entity_by_name(entity_name)
            if entity is None:
                return []
            parts: list[str] = []
            relations_r, events_r = await asyncio.gather(
                self._kg_service.get_relations(entity.id),
                self._kg_service.get_entity_timeline(entity.id),
                return_exceptions=True,
            )
            if not isinstance(relations_r, Exception) and relations_r:
                rel_text = DataSanitizer.sanitize_for_template(
                    [{"head": r.source_id, "relation": r.relation_type, "tail": r.target_id}
                     for r in relations_r[:20]]
                )
                parts.append(f"== Knowledge Graph Relations ==\n{rel_text}")
            if not isinstance(events_r, Exception) and events_r:
                evt_text = "\n".join(
                    f"- Ch.{getattr(e, 'chapter_number', '?')}: {e.description}"
                    for e in events_r[:15]
                )
                parts.append(f"== Timeline Events ==\n{evt_text}")
            return parts

        async def gather_vector() -> list[str]:
            if self._vector_service is None:
                return []
            try:
                from storysphere.config.settings import get_settings  # noqa: PLC0415
                max_chunks = get_settings().analysis_max_evidence_chunks
            except Exception:
                max_chunks = 20
            results = await self._vector_service.search(
                query_text=f"character {entity_name} actions personality traits",
                top_k=max_chunks,
                document_id=document_id,
            )
            if results:
                formatted = DataSanitizer.format_vector_store_results(results)
                return ["== Relevant Text Passages ==\n" + "\n".join(formatted[:10])]
            return []

        async def gather_keywords() -> dict[str, float]:
            if self._keyword_service is None:
                return {}
            try:
                kws = await self._keyword_service.get_entity_keywords(
                    document_id, entity_name, top_k=15
                )
                return kws or {}
            except Exception:
                logger.debug("Keyword retrieval failed for %s", entity_name, exc_info=True)
                return {}

        kg_parts_r, vector_parts_r, keywords_r = await asyncio.gather(
            gather_kg(),
            gather_vector(),
            gather_keywords(),
            return_exceptions=True,
        )

        context_parts: list[str] = []
        for r in [kg_parts_r, vector_parts_r]:
            if isinstance(r, Exception):
                logger.warning("CEP data gathering failed: %s", r)
            elif isinstance(r, list):
                context_parts.extend(r)

        keyword_map: dict[str, float] = {}
        if isinstance(keywords_r, Exception):
            logger.warning("CEP keyword gathering failed: %s", keywords_r)
        elif isinstance(keywords_r, dict):
            keyword_map = keywords_r
            if keyword_map:
                kw_text = ", ".join(f"{k} ({v:.2f})" for k, v in list(keyword_map.items())[:15])
                context_parts.append(f"== Character Keywords ==\n{kw_text}")

        context = "\n\n".join(context_parts) if context_parts else "(No context available)"

        llm = self._get_llm()
        prompt = self._localize_prompt(_CEP_SYSTEM_PROMPT, language)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=f"Character: {entity_name}\n\n{context}"),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"CEP extraction failed: {err}")

        return CEPResult(
            actions=parsed.get("actions", []),
            traits=parsed.get("traits", []),
            relations=_normalize_cep_relations(parsed.get("relations", [])),
            key_events=parsed.get("key_events", []),
            quotes=parsed.get("quotes", []),
            top_terms=keyword_map,
        )

    # ── Private: Archetype Classification ──────────────────────────────────────

    @_lf_observe(name="analysis.character.archetype", as_type="chain", capture_input=False, capture_output=False)
    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _classify_archetype(
        self, cep: CEPResult, framework: str, language: str
    ) -> ArchetypeResult:
        _lf_update_span(metadata={"framework": framework, "language": language})
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        from storysphere.config.archetypes import get_archetype_summary  # noqa: PLC0415

        archetype_list = get_archetype_summary(framework, language)
        system_prompt = self._localize_prompt(
            _ARCHETYPE_SYSTEM_PROMPT.format(
                framework=framework, archetype_list=archetype_list
            ),
            language,
        )

        cep_text = cep.model_dump_json(indent=2)

        llm = self._get_llm()
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Character Evidence Profile:\n{cep_text}"),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"Archetype classification failed: {err}")

        from storysphere.config.archetypes import resolve_archetype_name  # noqa: PLC0415

        return ArchetypeResult(
            framework=framework,
            primary=resolve_archetype_name(framework, parsed.get("primary", "unknown"), language) or "unknown",
            secondary=resolve_archetype_name(framework, parsed.get("secondary"), language),
            confidence=max(0.0, min(1.0, float(parsed.get("confidence", 0.5)))),
            evidence=parsed.get("evidence", []),
        )

    # ── Private: Character Arc Generation ──────────────────────────────────────

    @_lf_observe(name="analysis.character.arc", as_type="chain", capture_input=False, capture_output=False)
    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _generate_character_arc(
        self, cep: CEPResult, language: str = "en"
    ) -> list[ArcSegment]:
        _lf_update_span(metadata={"language": language})
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        cep_text = cep.model_dump_json(indent=2)

        llm = self._get_llm()
        prompt = self._localize_prompt(_ARC_SYSTEM_PROMPT, language)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=f"Character Evidence Profile:\n{cep_text}"),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, list):
            raise ValueError(f"Arc generation failed: {err}")

        return [
            ArcSegment(
                chapter_range=seg.get("chapter_range", "?"),
                phase=seg.get("phase", "Unknown"),
                description=seg.get("description", ""),
            )
            for seg in parsed
        ]

    # ── Private: Profile Summary ───────────────────────────────────────────────

    @_lf_observe(name="analysis.character.profile", as_type="chain", capture_input=False, capture_output=False)
    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _generate_profile(
        self, entity_name: str, cep: CEPResult, language: str = "en"
    ) -> CharacterProfile:
        _lf_update_span(metadata={"entity_name": entity_name, "language": language})
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        cep_text = cep.model_dump_json(indent=2)

        llm = self._get_llm()
        prompt = self._localize_prompt(_PROFILE_SYSTEM_PROMPT, language)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=f"Character: {entity_name}\n\nEvidence:\n{cep_text}"),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            # Fallback: treat the raw text as the summary
            return CharacterProfile(summary=raw[:500])

        return CharacterProfile(summary=parsed.get("summary", raw[:500]))

    # ── Public: analyze_event (Phase 5b) ───────────────────────────────────────

    @_lf_observe(name="analysis.event", as_type="chain", capture_input=False, capture_output=False)
    async def analyze_event(
        self,
        event_id: str,
        document_id: str,
        language: str = "en",
        progress_callback: Callable[[int, str], None] | None = None,
        retry_parts: list[str] | None = None,
        base_result: EventAnalysisResult | None = None,
    ) -> EventAnalysisResult:
        """Run full event analysis pipeline: EEP → causality → impact → summary.

        Args:
            event_id: Event ID from the KG.
            document_id: Source document ID for vector search scoping.

        Returns:
            Complete EventAnalysisResult.
        """
        _lf_update_span(metadata={"event_id": event_id, "document_id": document_id, "language": language})
        from datetime import timezone  # noqa: PLC0415

        if self._kg_service is None:
            raise ValueError("analyze_event requires kg_service")

        event = await self._kg_service.get_event(event_id)
        if event is None:
            raise ValueError(f"Event not found: {event_id}")

        # EEP gate. On partial re-run, reuse the cached EEP.
        if retry_parts and base_result is not None:
            eep = base_result.eep
        else:
            if progress_callback:
                progress_callback(5, "extracting event evidence profile (EEP)")
            eep = await self._extract_eep(event, document_id, language)

        # causality and impact as named parts.
        factories = {
            "causality": lambda: self._analyze_causality(eep, event, language),
            "impact": lambda: self._analyze_impact(eep, event, language),
        }
        wanted = {
            name: make()
            for name, make in factories.items()
            if retry_parts is None or name in retry_parts
        }

        if progress_callback:
            progress_callback(30, "analyzing causality and impact")
        from storysphere.core.gather_parts import gather_parts  # noqa: PLC0415
        results, failed = await gather_parts(wanted)

        if base_result is not None:
            causality = base_result.causality
            impact = base_result.impact
        else:
            causality = CausalityAnalysis(
                root_cause="", causal_chain=[], trigger_event_ids=[], chain_summary=""
            )
            impact = ImpactAnalysis(
                affected_participant_ids=[],
                participant_impacts=[],
                relation_changes=[],
                subsequent_event_ids=[],
                impact_summary="",
            )
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
        if progress_callback:
            progress_callback(95, "computing event coverage")
        coverage = self._compute_event_coverage(eep)

        return EventAnalysisResult(
            event_id=event_id,
            title=event.title,
            document_id=document_id,
            eep=eep,
            causality=causality,
            impact=impact,
            summary=event_summary,
            coverage=coverage,
            failed_parts=failed_parts,
            analyzed_at=datetime.now(timezone.utc),
        )

    # ── Private: EEP Extraction ────────────────────────────────────────────────

    @_lf_observe(name="analysis.event.eep", as_type="chain", capture_input=False, capture_output=False)
    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _extract_eep(
        self, event: Any, document_id: str, language: str = "en"
    ) -> EventEvidenceProfile:
        """Assemble EEP from KG + vector evidence, then call LLM to fill fields."""
        _lf_update_span(metadata={
            "event_id": event.id,
            "event_title": event.title,
            "document_id": document_id,
            "language": language,
        })
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        # Collect participant entities
        participants = []
        if self._kg_service is not None and event.participants:
            for pid in event.participants:
                entity = await self._kg_service.get_entity(pid)
                if entity is not None:
                    participants.append(entity)

        # Find prior/subsequent events via participant timelines
        prior_events: list[Any] = []
        subsequent_events: list[Any] = []
        seen_prior: set[str] = set()
        seen_subsequent: set[str] = set()
        if self._kg_service is not None:
            for pid in event.participants:
                timeline = await self._kg_service.get_entity_timeline(pid)
                for e in timeline:
                    if e.chapter < event.chapter and e.id not in seen_prior:
                        seen_prior.add(e.id)
                        prior_events.append(e)
                    elif e.chapter > event.chapter and e.id not in seen_subsequent:
                        seen_subsequent.add(e.id)
                        subsequent_events.append(e)

        # Vector search for text evidence
        text_evidence: list[str] = []
        raw_evidence_for_prompt: list[str] = []
        if self._vector_service is not None:
            try:
                results = await self._vector_service.search(
                    query_text=f"{event.title} {event.description}",
                    top_k=10,
                    document_id=document_id,
                )
                # Full format (with Chunk ID / Score) for LLM prompt context
                raw_evidence_for_prompt = DataSanitizer.format_vector_store_results(results)[:8]
                # Clean content only for storage / display
                # `results` are VectorSearchResult models, not dicts — using
                # .get() here raised AttributeError that the except below
                # swallowed, so text_evidence was always empty.
                text_evidence = [
                    DataSanitizer.sanitize_for_template(
                        DataSanitizer.result_field(r, "text", "")
                    )
                    for r in results[:8]
                    if DataSanitizer.result_field(r, "text")
                ]
            except Exception:
                logger.debug("Vector search failed for event %s", event.id, exc_info=True)

        # Keywords (optional)
        top_terms: dict[str, float] = {}
        if self._keyword_service is not None:
            try:
                result = await self._keyword_service.get_chapter_keywords(
                    document_id, event.chapter
                )
                if result is not None:
                    top_terms = result
            except Exception:
                logger.debug("Keyword retrieval failed for event %s", event.id, exc_info=True)

        # Build context for LLM
        participants_text = "\n".join(
            f"- {e.name} ({e.entity_type.value})" for e in participants
        ) or "(none)"
        prior_text = "\n".join(
            f"- Ch.{e.chapter}: {e.title}" for e in prior_events[:10]
        ) or "(none)"
        evidence_text = "\n".join(raw_evidence_for_prompt) or "(none)"
        consequences_text = DataSanitizer.sanitize_for_template(event.consequences)

        human_content = (
            f"EVENT:\n"
            f"Title: {DataSanitizer.sanitize_for_template(event.title)}\n"
            f"Type: {event.event_type.value}\n"
            f"Chapter: {event.chapter}\n"
            f"Description: {DataSanitizer.sanitize_for_template(event.description)}\n"
            f"Significance: {DataSanitizer.sanitize_for_template(event.significance or 'not specified')}\n"
            f"Consequences: {consequences_text}\n\n"
            f"PARTICIPANTS:\n{participants_text}\n\n"
            f"PRIOR EVENTS (same participants, earlier chapters):\n{prior_text}\n\n"
            f"TEXT EVIDENCE:\n{evidence_text}"
        )

        llm = self._get_llm()
        prompt = self._localize_prompt(_EEP_SYSTEM_PROMPT, language)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=human_content),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"EEP extraction failed: {err}")

        # Parse participant roles
        parsed_roles = parsed.get("participant_roles", [])
        participant_roles: list[ParticipantRole] = []
        for pr in parsed_roles:
            entity_name = pr.get("entity_name", "")
            entity_id = next(
                (e.id for e in participants if e.name == entity_name),
                entity_name,
            )
            try:
                role = ParticipantRoleType(pr.get("role", "actor"))
            except ValueError:
                role = ParticipantRoleType.ACTOR
            participant_roles.append(ParticipantRole(
                entity_id=entity_id,
                entity_name=entity_name,
                role=role,
                impact_description=pr.get("impact_description", ""),
            ))

        try:
            importance = EventImportance(parsed.get("event_importance", "satellite"))
        except ValueError:
            importance = EventImportance.SATELLITE

        return EventEvidenceProfile(
            state_before=parsed.get("state_before", ""),
            state_after=parsed.get("state_after", ""),
            causal_factors=parsed.get("causal_factors", []),
            prior_event_ids=[e.id for e in prior_events],
            participant_roles=participant_roles,
            consequences=list(event.consequences),
            subsequent_event_ids=[e.id for e in subsequent_events],
            structural_role=parsed.get("structural_role", ""),
            event_importance=importance,
            thematic_significance=parsed.get("thematic_significance", ""),
            text_evidence=text_evidence,
            key_quotes=parsed.get("key_quotes", []),
            top_terms=top_terms,
        )

    # ── Private: Causality Analysis ────────────────────────────────────────────

    @_lf_observe(name="analysis.event.causality", as_type="chain", capture_input=False, capture_output=False)
    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _analyze_causality(
        self, eep: EventEvidenceProfile, event: Any, language: str = "en"
    ) -> CausalityAnalysis:
        """Construct narrative causal chain leading to this event."""
        _lf_update_span(metadata={"event_id": event.id, "language": language})
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        # Fetch prior event details
        prior_details: list[str] = []
        if self._kg_service is not None:
            for eid in eep.prior_event_ids[:10]:
                e = await self._kg_service.get_event(eid)
                if e is not None:
                    prior_details.append(f"[{eid}] Ch.{e.chapter}: {e.title} — {e.description}")

        causal_text = "\n".join(
            f"{i+1}. {f}" for i, f in enumerate(eep.causal_factors)
        ) or "(none identified)"
        prior_text = "\n".join(prior_details) or "(none)"
        evidence_snippets = "\n".join(eep.text_evidence[:3]) or "(none)"

        human_content = (
            f"EVENT: {DataSanitizer.sanitize_for_template(event.title)} (Chapter {event.chapter})\n"
            f"Description: {DataSanitizer.sanitize_for_template(event.description)}\n\n"
            f"EEP CAUSAL FACTORS:\n{causal_text}\n\n"
            f"PRIOR EVENTS (chronological):\n{prior_text}\n\n"
            f"RELEVANT TEXT EXCERPTS:\n{evidence_snippets}"
        )

        llm = self._get_llm()
        prompt = self._localize_prompt(_CAUSALITY_SYSTEM_PROMPT, language)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=human_content),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"Causality analysis failed: {err}")

        return CausalityAnalysis(
            root_cause=parsed.get("root_cause", ""),
            causal_chain=parsed.get("causal_chain", []),
            trigger_event_ids=parsed.get("trigger_event_ids", []),
            chain_summary=parsed.get("chain_summary", ""),
        )

    # ── Private: Impact Analysis ───────────────────────────────────────────────

    @_lf_observe(name="analysis.event.impact", as_type="chain", capture_input=False, capture_output=False)
    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _analyze_impact(
        self, eep: EventEvidenceProfile, event: Any, language: str = "en"
    ) -> ImpactAnalysis:
        """Trace what happened because of this event."""
        _lf_update_span(metadata={"event_id": event.id, "language": language})
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        # Fetch subsequent event details
        subsequent_details: list[str] = []
        if self._kg_service is not None:
            for eid in eep.subsequent_event_ids[:10]:
                e = await self._kg_service.get_event(eid)
                if e is not None:
                    subsequent_details.append(f"[{eid}] Ch.{e.chapter}: {e.title} — {e.description}")

        consequences_text = "\n".join(
            f"{i+1}. {c}" for i, c in enumerate(eep.consequences)
        ) or "(none)"
        roles_text = "\n".join(
            f"- {r.entity_name} ({r.role.value}): {r.impact_description}"
            for r in eep.participant_roles
        ) or "(none)"
        subsequent_text = "\n".join(subsequent_details) or "(none)"
        evidence_snippets = "\n".join(eep.text_evidence[:3]) or "(none)"

        human_content = (
            f"EVENT: {DataSanitizer.sanitize_for_template(event.title)} (Chapter {event.chapter})\n"
            f"State before: {DataSanitizer.sanitize_for_template(eep.state_before)}\n"
            f"State after: {DataSanitizer.sanitize_for_template(eep.state_after)}\n\n"
            f"EEP CONSEQUENCES:\n{consequences_text}\n\n"
            f"PARTICIPANT ROLES:\n{roles_text}\n\n"
            f"SUBSEQUENT EVENTS (chronological):\n{subsequent_text}\n\n"
            f"RELEVANT TEXT EXCERPTS:\n{evidence_snippets}"
        )

        llm = self._get_llm()
        prompt = self._localize_prompt(_IMPACT_SYSTEM_PROMPT, language)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=human_content),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"Impact analysis failed: {err}")

        return ImpactAnalysis(
            affected_participant_ids=parsed.get("affected_participant_ids", []),
            participant_impacts=parsed.get("participant_impacts", []),
            relation_changes=parsed.get("relation_changes", []),
            subsequent_event_ids=parsed.get("subsequent_event_ids", []),
            impact_summary=parsed.get("impact_summary", ""),
        )

    # ── Private: Event Summary ─────────────────────────────────────────────────

    @_lf_observe(name="analysis.event.summary", as_type="chain", capture_input=False, capture_output=False)
    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _generate_event_summary(
        self,
        event: Any,
        eep: EventEvidenceProfile,
        causality: CausalityAnalysis,
        impact: ImpactAnalysis,
        language: str = "en",
    ) -> EventSummary:
        """Synthesize all analysis into a ~150-word narrative paragraph."""
        _lf_update_span(metadata={"event_id": event.id, "language": language})
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        participants_text = ", ".join(
            f"{r.entity_name} ({r.role.value})" for r in eep.participant_roles
        ) or "(none)"
        causal_chain_text = "\n".join(
            f"{i+1}. {step}" for i, step in enumerate(causality.causal_chain)
        ) or "(none)"
        quotes_text = "\n".join(
            f"「{q}」" for q in eep.key_quotes[:3]
        ) or "(none)"

        human_content = (
            f"EVENT: {DataSanitizer.sanitize_for_template(event.title)} "
            f"({event.event_type.value}, Chapter {event.chapter})\n"
            f"Structural role: {eep.structural_role} ({eep.event_importance.value})\n\n"
            f"STATE BEFORE: {DataSanitizer.sanitize_for_template(eep.state_before)}\n"
            f"STATE AFTER: {DataSanitizer.sanitize_for_template(eep.state_after)}\n\n"
            f"CAUSAL CHAIN:\n{causal_chain_text}\n\n"
            f"IMPACT SUMMARY: {DataSanitizer.sanitize_for_template(impact.impact_summary)}\n\n"
            f"RELATION CHANGES: {', '.join(impact.relation_changes) or '(none)'}\n\n"
            f"PARTICIPANTS: {participants_text}\n\n"
            f"KEY QUOTES FROM TEXT:\n{quotes_text}\n\n"
            f"THEMATIC SIGNIFICANCE: {DataSanitizer.sanitize_for_template(eep.thematic_significance)}"
        )

        llm = self._get_llm()
        prompt = self._localize_prompt(_EVENT_SUMMARY_SYSTEM_PROMPT, language)
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=human_content),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            return EventSummary(summary=raw[:500])

        return EventSummary(summary=parsed.get("summary", raw[:500]))

    # ── Private: Event Coverage (pure computation) ─────────────────────────────

    @staticmethod
    def _compute_event_coverage(eep: EventEvidenceProfile) -> EventCoverageMetrics:
        gaps: list[str] = []
        if not eep.prior_event_ids:
            gaps.append("No prior events found for causal analysis")
        if not eep.subsequent_event_ids:
            gaps.append("No subsequent events found for impact analysis")
        if not eep.text_evidence:
            gaps.append("No text evidence chunks found")
        if not eep.participant_roles:
            gaps.append("No participant roles identified")
        return EventCoverageMetrics(
            evidence_chunk_count=len(eep.text_evidence),
            participant_count=len(eep.participant_roles),
            causal_event_count=len(eep.prior_event_ids),
            subsequent_event_count=len(eep.subsequent_event_ids),
            gaps=gaps,
        )

    # ── Private: Coverage Metrics (pure computation) ───────────────────────────

    @staticmethod
    def _compute_coverage(cep: CEPResult) -> CoverageMetrics:
        gaps: list[str] = []
        if not cep.actions:
            gaps.append("No character actions found")
        if not cep.traits:
            gaps.append("No personality traits identified")
        if not cep.relations:
            gaps.append("No relationships found")
        if not cep.key_events:
            gaps.append("No key events found")
        if not cep.quotes:
            gaps.append("No notable quotes found")

        # Collect source chunk IDs from key_events
        chunk_ids = []
        for evt in cep.key_events:
            if isinstance(evt, dict) and "chunk_id" in evt:
                chunk_ids.append(evt["chunk_id"])

        return CoverageMetrics(
            action_count=len(cep.actions),
            trait_count=len(cep.traits),
            relation_count=len(cep.relations),
            event_count=len(cep.key_events),
            quote_count=len(cep.quotes),
            gaps=gaps,
            source_chunk_ids=chunk_ids,
        )
