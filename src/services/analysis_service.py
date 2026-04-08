"""AnalysisService — LLM-based literary analysis.

Owns the LLM logic for generating insights and deep character analysis.
Tools delegate to this service.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Callable

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.token_callback import set_llm_service_context
from core.utils.data_sanitizer import DataSanitizer
from core.utils.output_extractor import extract_json_from_text
from services.analysis_models import (
    ArcSegment,
    ArchetypeResult,
    CEPResult,
    CausalityAnalysis,
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
- "relations": list of objects with "target", "type", "description"
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
            from core.llm_client import get_llm_client  # noqa: PLC0415

            t = temperature if temperature is not None else 0.3
            self._llm = get_llm_client().get_with_local_fallback(temperature=t)
        return self._llm

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        """Append a language instruction to a system prompt."""
        from core.language_detection import get_language_display_name  # noqa: PLC0415

        lang_name = get_language_display_name(language)
        return prompt + f"\nRespond in {lang_name}."

    # ── Public: generate_insight (Phase 3) ─────────────────────────────────────

    async def generate_insight(
        self, topic: str, context: str = "", language: str = "en"
    ) -> str:
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

    async def analyze_character(
        self,
        entity_name: str,
        document_id: str,
        archetype_frameworks: list[str] | None = None,
        language: str = "en",
        progress_callback: Callable[[int, str], None] | None = None,
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

        # Resolve entity
        entity_id = entity_name
        if self._kg_service is not None:
            entity = await self._kg_service.get_entity_by_name(entity_name)
            if entity is not None:
                entity_id = entity.id

        # Step 1: Extract CEP (must complete before steps 2-4)
        if progress_callback:
            progress_callback(5, "extracting character evidence profile (CEP)")
        cep = await self._extract_cep(entity_name, document_id, language)

        # Steps 2, 3, 4 in parallel: archetypes + arc + profile
        if progress_callback:
            progress_callback(30, "analyzing archetype, arc, and profile")
        archetype_coros = [
            self._classify_archetype(cep, fw, language)
            for fw in archetype_frameworks
        ]
        all_results = await asyncio.gather(
            *archetype_coros,
            self._generate_character_arc(cep, language),
            self._generate_profile(entity_name, cep, language),
            return_exceptions=True,
        )

        n = len(archetype_frameworks)
        archetype_results = all_results[:n]
        arc_result = all_results[n]
        profile_result = all_results[n + 1]

        archetypes = []
        for i, ar in enumerate(archetype_results):
            if isinstance(ar, Exception):
                logger.warning(
                    "Archetype classification failed for %s/%s: %s",
                    archetype_frameworks[i], language, ar,
                )
            else:
                archetypes.append(ar)

        if isinstance(arc_result, Exception):
            logger.warning("Arc generation failed: %s", arc_result)
            arc: list[ArcSegment] = []
        else:
            arc = arc_result

        if isinstance(profile_result, Exception):
            logger.warning("Profile generation failed: %s", profile_result)
            profile = CharacterProfile(summary="")
        else:
            profile = profile_result

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
        )

    # ── Private: CEP Extraction ────────────────────────────────────────────────

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
                from config.settings import get_settings  # noqa: PLC0415
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
                return [f"== Relevant Text Passages ==\n" + "\n".join(formatted[:10])]
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
            relations=parsed.get("relations", []),
            key_events=parsed.get("key_events", []),
            quotes=parsed.get("quotes", []),
            top_terms=keyword_map,
        )

    # ── Private: Archetype Classification ──────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _classify_archetype(
        self, cep: CEPResult, framework: str, language: str
    ) -> ArchetypeResult:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415
        from config.archetypes import get_archetype_summary  # noqa: PLC0415

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

        return ArchetypeResult(
            framework=framework,
            primary=parsed.get("primary", "unknown"),
            secondary=parsed.get("secondary"),
            confidence=max(0.0, min(1.0, float(parsed.get("confidence", 0.5)))),
            evidence=parsed.get("evidence", []),
        )

    # ── Private: Character Arc Generation ──────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _generate_character_arc(
        self, cep: CEPResult, language: str = "en"
    ) -> list[ArcSegment]:
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

    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _generate_profile(
        self, entity_name: str, cep: CEPResult, language: str = "en"
    ) -> CharacterProfile:
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

    async def analyze_event(
        self,
        event_id: str,
        document_id: str,
        language: str = "en",
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> EventAnalysisResult:
        """Run full event analysis pipeline: EEP → causality → impact → summary.

        Args:
            event_id: Event ID from the KG.
            document_id: Source document ID for vector search scoping.

        Returns:
            Complete EventAnalysisResult.
        """
        from datetime import timezone  # noqa: PLC0415

        if self._kg_service is None:
            raise ValueError("analyze_event requires kg_service")

        event = await self._kg_service.get_event(event_id)
        if event is None:
            raise ValueError(f"Event not found: {event_id}")

        if progress_callback:
            progress_callback(5, "extracting event evidence profile (EEP)")
        eep = await self._extract_eep(event, document_id, language)

        # causality and impact are independent — run in parallel
        if progress_callback:
            progress_callback(30, "analyzing causality and impact")
        causality_r, impact_r = await asyncio.gather(
            self._analyze_causality(eep, event, language),
            self._analyze_impact(eep, event, language),
            return_exceptions=True,
        )

        if isinstance(causality_r, Exception):
            logger.warning("Causality analysis failed: %s", causality_r)
            causality = CausalityAnalysis(
                root_cause="", causal_chain=[], trigger_event_ids=[], chain_summary=""
            )
        else:
            causality = causality_r

        if isinstance(impact_r, Exception):
            logger.warning("Impact analysis failed: %s", impact_r)
            impact = ImpactAnalysis(
                affected_participant_ids=[],
                participant_impacts=[],
                relation_changes=[],
                subsequent_event_ids=[],
                impact_summary="",
            )
        else:
            impact = impact_r

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
            analyzed_at=datetime.now(timezone.utc),
        )

    # ── Private: EEP Extraction ────────────────────────────────────────────────

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
                text_evidence = [
                    DataSanitizer.sanitize_for_template(r.get("text", ""))
                    for r in results[:8]
                    if r.get("text")
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
