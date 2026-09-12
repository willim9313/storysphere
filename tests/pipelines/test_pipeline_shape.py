"""A pipeline's shape must match who drives it — B-118 (走查 §3-2).

    package/     ingestion step, driven by workflows/ingestion.py
    module.py    on-demand orchestrator, driven by a request via api/deps.py

The rule held across all seven pipelines before it was written down anywhere,
which is the state a convention is most likely to be broken from: nothing
states it, so nothing contradicts whoever breaks it. This is the contradiction.

Deliberately static — reading the directory and grepping the caller — rather
than importing. Importing every pipeline drags in Qdrant and LLM clients to
answer a question about file layout.
"""

from __future__ import annotations

import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
PIPELINES = REPO_ROOT / "backend" / "storysphere" / "pipelines"
INGESTION = REPO_ROOT / "backend" / "storysphere" / "workflows" / "ingestion.py"

#: Not pipelines: the shared base and the package marker.
_NOT_A_PIPELINE = {"__init__.py", "base.py", "__pycache__"}


def _pipelines() -> dict[str, bool]:
    """Map pipeline name → is it a package."""
    out: dict[str, bool] = {}
    for entry in PIPELINES.iterdir():
        if entry.name in _NOT_A_PIPELINE:
            continue
        if entry.is_dir():
            out[entry.name] = True
        elif entry.suffix == ".py":
            out[entry.stem] = False
    return out


def _driven_by_ingestion(name: str) -> bool:
    return name in INGESTION.read_text(errors="ignore")


class TestPipelineShape:
    def test_there_are_pipelines_to_check(self):
        """A rename that empties the scan would make every assertion below vacuous."""
        assert len(_pipelines()) >= 5

    def test_packages_are_ingestion_steps(self):
        offenders = [
            name
            for name, is_pkg in _pipelines().items()
            if is_pkg and not _driven_by_ingestion(name)
        ]

        assert offenders == [], (
            f"{offenders} are packages but ingestion does not drive them — "
            "an on-demand orchestrator is a module (see pipelines/__init__.py)"
        )

    def test_modules_are_not_ingestion_steps(self):
        offenders = [
            name
            for name, is_pkg in _pipelines().items()
            if not is_pkg and _driven_by_ingestion(name)
        ]

        assert offenders == [], (
            f"{offenders} are modules but ingestion drives them — "
            "an ingestion step is a package (see pipelines/__init__.py)"
        )

    def test_symbol_discovery_is_a_package_despite_holding_one_file(self):
        """The instance that makes the rule look like an accident.

        Flattening it to `symbol_discovery.py` would pass a 'tidy up the lone
        file' review and silently destroy the signal, so it is pinned here.
        """
        pipelines = _pipelines()

        assert pipelines.get("symbol_discovery") is True
        assert _driven_by_ingestion("symbol_discovery")
