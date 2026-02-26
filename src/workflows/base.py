"""Abstract base class for business-level workflows.

Workflows differ from pipelines:
- Pipelines are deterministic ETL (no agent decisions).
- Workflows may orchestrate multiple pipelines, call agents, or coordinate
  async tasks.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Generic, TypeVar

logger = logging.getLogger(__name__)

InputT = TypeVar("InputT")
OutputT = TypeVar("OutputT")


class BaseWorkflow(ABC, Generic[InputT, OutputT]):
    """Base class for all StorySphere workflows."""

    @property
    def name(self) -> str:
        return self.__class__.__name__

    @abstractmethod
    async def run(self, input_data: InputT) -> OutputT:
        """Execute the workflow."""
        ...

    async def __call__(self, input_data: InputT) -> OutputT:
        logger.info("Workflow %s started", self.name)
        result = await self.run(input_data)
        logger.info("Workflow %s finished", self.name)
        return result

    def _log_step(self, step: str, **kwargs: Any) -> None:
        extras = "  ".join(f"{k}={v}" for k, v in kwargs.items())
        logger.debug("[%s] %s  %s", self.name, step, extras)
