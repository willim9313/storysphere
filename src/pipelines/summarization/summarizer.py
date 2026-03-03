"""Backward-compatibility shim — delegates to SummaryService.

The real LLM summarization logic now lives in ``services.summary_service``.
This module re-exports ``SummaryService`` as ``ChapterSummarizer`` so that
existing pipeline code and tests continue to work unchanged.
"""

from services.summary_service import SummaryService as ChapterSummarizer

__all__ = ["ChapterSummarizer"]
