"""The `observe` shim has to keep langfuse optional.

Langfuse is a development-time observability tool. Every module that decorates
work with `@observe` must still import, and still run, on a machine where the
package is not installed. These tests hold that line by importing the affected
modules with `langfuse` blocked from `sys.modules`.
"""

from __future__ import annotations

import ast
import importlib
import inspect
import pathlib
import sys

import pytest

BACKEND = pathlib.Path(__file__).resolve().parents[2] / "backend" / "storysphere"

# Every module that decorates something with the shared shim.
OBSERVE_CONSUMERS = [
    "storysphere.workflows.ingestion",
    "storysphere.agents.analysis_agent",
    "storysphere.services.imagery_extractor",
    "storysphere.services.extraction_service",
    "storysphere.services.keyword_service",
    "storysphere.services.summary_service",
    "storysphere.services.analysis_service",
]


class _BlockLangfuse:
    """Meta-path finder that makes `import langfuse` fail as if not installed."""

    def find_spec(self, fullname, path=None, target=None):
        if fullname == "langfuse" or fullname.startswith("langfuse."):
            raise ImportError(f"No module named {fullname!r} (blocked by test)")
        return None


@pytest.fixture
def without_langfuse():
    """Run the body with langfuse unimportable and previously-imported copies gone."""
    finder = _BlockLangfuse()
    saved = {k: v for k, v in sys.modules.items() if k.split(".")[0] in ("langfuse", "storysphere")}
    for name in list(sys.modules):
        if name.split(".")[0] in ("langfuse", "storysphere"):
            del sys.modules[name]
    sys.meta_path.insert(0, finder)
    try:
        yield
    finally:
        sys.meta_path.remove(finder)
        for name in list(sys.modules):
            if name.split(".")[0] in ("langfuse", "storysphere"):
                del sys.modules[name]
        sys.modules.update(saved)


class TestShimWithoutLangfuse:
    def test_tracing_imports_without_langfuse(self, without_langfuse):
        tracing = importlib.import_module("storysphere.core.tracing")
        assert callable(tracing.observe)

    def test_observe_becomes_a_transparent_no_op(self, without_langfuse):
        tracing = importlib.import_module("storysphere.core.tracing")

        @tracing.observe(name="analysis.character.cep", as_type="chain", capture_input=False)
        def work(a, b=2):
            return a + b

        assert work(1) == 3
        assert work(1, b=5) == 6
        assert work.__name__ == "work"

    def test_no_op_accepts_any_keywords(self, without_langfuse):
        tracing = importlib.import_module("storysphere.core.tracing")
        decorator = tracing.observe(anything=1, at=2, all=3)
        sentinel = object()
        assert decorator(lambda: sentinel)() is sentinel

    @pytest.mark.parametrize("modname", OBSERVE_CONSUMERS)
    def test_consumer_modules_import_without_langfuse(self, without_langfuse, modname):
        """This is the check the whole shim exists for."""
        mod = importlib.import_module(modname)
        assert mod is not None

    def test_update_span_is_silent_without_langfuse(self, without_langfuse):
        tracing = importlib.import_module("storysphere.core.tracing")
        tracing._handler = object()  # pretend tracing was configured
        try:
            tracing.update_span(metadata={"x": 1})  # must not raise
        finally:
            tracing._handler = None

    def test_configure_returns_false_without_langfuse(self, without_langfuse):
        tracing = importlib.import_module("storysphere.core.tracing")

        class _S:
            langfuse_enabled = True
            langfuse_public_key = "pk"
            langfuse_secret_key = "sk"
            langfuse_sample_rate = 1.0
            langfuse_base_url = ""

        assert tracing.configure_langfuse(_S()) is False


class TestShimWithLangfuse:
    def test_real_observe_is_re_exported_when_installed(self):
        pytest.importorskip("langfuse")
        from storysphere.core.tracing import observe

        assert "langfuse" in getattr(observe, "__module__", "")


class TestSinglePointOfContact:
    def test_only_tracing_names_the_langfuse_package(self):
        """Swapping observability vendors should mean editing one file.

        Seven modules used to carry their own `try: from langfuse import
        observe` block. If a new one appears, this fails and points at it.
        """
        offenders = []
        for py in sorted(BACKEND.rglob("*.py")):
            if py.name == "tracing.py" and py.parent.name == "core":
                continue
            tree = ast.parse(py.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                mod = None
                if isinstance(node, ast.ImportFrom):
                    mod = node.module
                elif isinstance(node, ast.Import):
                    mod = node.names[0].name
                if mod and mod.split(".")[0] == "langfuse":
                    offenders.append(f"{py.relative_to(BACKEND)}:{node.lineno}")
        assert offenders == [], (
            "import `observe` from storysphere.core.tracing instead: " + ", ".join(offenders)
        )

    def test_shared_llm_helper_does_not_open_spans(self):
        """Span boundaries are a call-site decision, not a side effect of refactoring."""
        from storysphere.core import llm_call

        tree = ast.parse(inspect.getsource(llm_call))
        decorated = []
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for dec in node.decorator_list:
                target = dec.func if isinstance(dec, ast.Call) else dec
                name = getattr(target, "id", None) or getattr(target, "attr", "")
                if "observe" in name:
                    decorated.append(f"{node.name} <- @{name}")
        assert decorated == [], f"tracing crept into the shared path: {decorated}"
