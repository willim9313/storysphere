"""Abstract base class for all ETL pipelines."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Generic, TypeVar

logger = logging.getLogger(__name__)

InputT = TypeVar("InputT")
OutputT = TypeVar("OutputT")


class BasePipeline(ABC, Generic[InputT, OutputT]):
    """Deterministic ETL pipeline — no LLM decision-making at the orchestration level.

    Subclasses implement ``run`` which accepts an input and returns a typed output.
    All pipelines are async to allow I/O without blocking.
    """

    @property
    def name(self) -> str:
        return self.__class__.__name__

    @abstractmethod
    async def run(self, input_data: InputT) -> OutputT:
        """Execute the pipeline and return the result."""
        ...

    async def __call__(self, input_data: InputT) -> OutputT:
        logger.info("Pipeline %s started", self.name)
        result = await self.run(input_data)
        logger.info("Pipeline %s finished", self.name)
        return result

    # ── helpers ────────────────────────────────────────────────────────────────

    def _log_step(self, step: str, **kwargs: Any) -> None:
        extras = "  ".join(f"{k}={v}" for k, v in kwargs.items())
        logger.debug("[%s] %s  %s", self.name, step, extras)
