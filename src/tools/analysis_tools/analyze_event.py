"""AnalyzeEventTool — deep event analysis via EEP pipeline.

USE when: the user wants a comprehensive analysis of a specific event,
    including causes, consequences, participant roles, and thematic meaning.
DO NOT USE when: the user only wants the event timeline
    (use GetEntityTimelineTool) or basic event data.
Example queries: "Analyze the significance of the battle.",
    "What caused the turning point?", "Deep analysis of the meeting event."
"""

from __future__ import annotations

import json
from typing import Any, Type

from langchain_core.tools import BaseTool

from tools.schemas import AnalyzeEventInput, EventAnalysisOutput


class AnalyzeEventTool(BaseTool):
    """Deep event analysis using EEP pipeline (causality, impact, summary)."""

    name: str = "analyze_event"
    description: str = (
        "Perform comprehensive event analysis including state transitions, "
        "causal chain, participant roles, impact, and thematic significance. "
        "USE for: deep event analysis, 'what caused X', consequence analysis, "
        "'what was the significance of event Y'. "
        "DO NOT USE for: event timelines (use get_entity_timeline) "
        "or listing events. "
        "Input: event ID, optional document ID."
    )
    args_schema: Type[AnalyzeEventInput] = AnalyzeEventInput

    analysis_agent: Any = None

    class Config:
        arbitrary_types_allowed = True

    async def _arun(
        self,
        event_id: str,
        document_id: str = "",
        include_consequences: bool = True,
    ) -> str:
        if self.analysis_agent is None:
            return json.dumps({"error": "AnalyzeEventTool requires analysis_agent"})
        try:
            result = await self.analysis_agent.analyze_event(event_id, document_id)
            output = EventAnalysisOutput(
                event_id=result.event_id,
                title=result.title,
                document_id=result.document_id,
                state_before=result.eep.state_before,
                state_after=result.eep.state_after,
                structural_role=result.eep.structural_role,
                event_importance=result.eep.event_importance.value,
                causal_chain=result.causality.causal_chain,
                root_cause=result.causality.root_cause,
                chain_summary=result.causality.chain_summary,
                impact_summary=result.impact.impact_summary,
                relation_changes=result.impact.relation_changes,
                participant_roles=[r.model_dump() for r in result.eep.participant_roles],
                thematic_significance=result.eep.thematic_significance,
                summary=result.summary.summary,
                coverage_gaps=result.coverage.gaps,
                analyzed_at=result.analyzed_at.isoformat(),
            )
            return output.model_dump_json()
        except Exception as e:
            return json.dumps({"error": str(e)})

    def _run(self, event_id: str, document_id: str = "", include_consequences: bool = True) -> str:
        raise NotImplementedError("Use async _arun instead.")
