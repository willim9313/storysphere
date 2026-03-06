"""AnalysisService — LLM-based literary analysis.

Owns the LLM logic for generating insights and deep character analysis.
Tools delegate to this service.
"""

from __future__ import annotations

import logging
from typing import Any

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.utils.data_sanitizer import DataSanitizer
from core.utils.output_extractor import extract_json_from_text
from services.analysis_models import (
    ArcSegment,
    ArchetypeResult,
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
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
            self._llm = get_llm_client().get_primary(temperature=t)
        return self._llm

    # ── Public: generate_insight (Phase 3) ─────────────────────────────────────

    async def generate_insight(self, topic: str, context: str = "") -> str:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        llm = self._get_llm()
        messages = [
            SystemMessage(content=_INSIGHT_SYSTEM_PROMPT),
            HumanMessage(
                content=f"Topic: {topic}\n\nContext:\n{context}" if context
                else f"Topic: {topic}\n\n(No additional context provided.)"
            ),
        ]
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

        # Step 1: Extract CEP
        cep = await self._extract_cep(entity_name, document_id)

        # Step 2: Classify archetypes
        archetypes = []
        for framework in archetype_frameworks:
            try:
                ar = await self._classify_archetype(cep, framework, language)
                archetypes.append(ar)
            except Exception:
                logger.warning("Archetype classification failed for %s/%s", framework, language, exc_info=True)

        # Step 3: Generate character arc
        arc = await self._generate_character_arc(cep)

        # Step 4: Generate profile summary
        profile = await self._generate_profile(entity_name, cep)

        # Step 5: Compute coverage metrics
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
    async def _extract_cep(self, entity_name: str, document_id: str) -> CEPResult:
        """Extract Character Evidence Profile from KG + vector + keywords + LLM."""
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        context_parts: list[str] = []

        # 1) KG relations
        if self._kg_service is not None:
            entity = await self._kg_service.get_entity_by_name(entity_name)
            if entity is not None:
                relations = await self._kg_service.get_relations(entity.id)
                if relations:
                    rel_text = DataSanitizer.sanitize_for_template(
                        [{"head": r.source_id, "relation": r.relation_type, "tail": r.target_id}
                         for r in relations[:20]]
                    )
                    context_parts.append(f"== Knowledge Graph Relations ==\n{rel_text}")

                events = await self._kg_service.get_entity_timeline(entity.id)
                if events:
                    evt_text = "\n".join(
                        f"- Ch.{getattr(e, 'chapter_number', '?')}: {e.description}"
                        for e in events[:15]
                    )
                    context_parts.append(f"== Timeline Events ==\n{evt_text}")

        # 2) Vector search for relevant passages
        if self._vector_service is not None:
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
                context_parts.append(f"== Relevant Text Passages ==\n" + "\n".join(formatted[:10]))

        # 3) Keywords
        if self._keyword_service is not None:
            try:
                kws = await self._keyword_service.get_entity_keywords(
                    document_id, entity_name, top_k=15
                )
                if kws:
                    kw_text = ", ".join(f"{k} ({v:.2f})" for k, v in list(kws.items())[:15])
                    context_parts.append(f"== Character Keywords ==\n{kw_text}")
            except Exception:
                logger.debug("Keyword retrieval failed for %s", entity_name, exc_info=True)

        context = "\n\n".join(context_parts) if context_parts else "(No context available)"

        llm = self._get_llm()
        messages = [
            SystemMessage(content=_CEP_SYSTEM_PROMPT),
            HumanMessage(content=f"Character: {entity_name}\n\n{context}"),
        ]
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            raise ValueError(f"CEP extraction failed: {err}")

        # Merge keywords into CEP
        top_terms: dict[str, float] = {}
        if self._keyword_service is not None:
            try:
                top_terms = await self._keyword_service.get_entity_keywords(
                    document_id, entity_name, top_k=10
                )
            except Exception:
                pass

        return CEPResult(
            actions=parsed.get("actions", []),
            traits=parsed.get("traits", []),
            relations=parsed.get("relations", []),
            key_events=parsed.get("key_events", []),
            quotes=parsed.get("quotes", []),
            top_terms=top_terms,
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
        system_prompt = _ARCHETYPE_SYSTEM_PROMPT.format(
            framework=framework, archetype_list=archetype_list
        )

        cep_text = cep.model_dump_json(indent=2)

        llm = self._get_llm()
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Character Evidence Profile:\n{cep_text}"),
        ]
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
    async def _generate_character_arc(self, cep: CEPResult) -> list[ArcSegment]:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        cep_text = cep.model_dump_json(indent=2)

        llm = self._get_llm()
        messages = [
            SystemMessage(content=_ARC_SYSTEM_PROMPT),
            HumanMessage(content=f"Character Evidence Profile:\n{cep_text}"),
        ]
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
    async def _generate_profile(self, entity_name: str, cep: CEPResult) -> CharacterProfile:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        cep_text = cep.model_dump_json(indent=2)

        llm = self._get_llm()
        messages = [
            SystemMessage(content=_PROFILE_SYSTEM_PROMPT),
            HumanMessage(content=f"Character: {entity_name}\n\nEvidence:\n{cep_text}"),
        ]
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, dict):
            # Fallback: treat the raw text as the summary
            return CharacterProfile(summary=raw[:500])

        return CharacterProfile(summary=parsed.get("summary", raw[:500]))

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
