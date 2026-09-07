"""chat agent 必須真的拿到深度分析工具 —— B-104。

`get_chat_tools()` 只在收到 `analysis_agent` 時才加入 `analyze_character` 與
`analyze_event`，而那個參數是選填的。2026-09-07 之前**沒有任何呼叫端傳它**，
於是兩個完整實作的工具從未被註冊；當時的目錄與註解都寫著它們是「未實作的 stub」，
反而讓這件事看起來是預期行為。

這裡釘住兩端：registry 在拿到 agent 時會加、`deps.get_chat_agent()` 會傳。
少了任一端，工具就會**靜默消失**——agent 照常運作，只是永遠不會選到它們。
"""

from __future__ import annotations

import ast
import pathlib
from unittest.mock import AsyncMock

DEEP_TOOLS = {"analyze_character", "analyze_event"}


def _tool_names(**kwargs) -> set[str]:
    from storysphere.tools.tool_registry import get_chat_tools

    tools = get_chat_tools(
        kg_service=AsyncMock(), doc_service=AsyncMock(), vector_service=AsyncMock(), **kwargs
    )
    return {t.name for t in tools}


class TestRegistry:
    def test_deep_tools_are_added_when_an_agent_is_given(self):
        assert DEEP_TOOLS <= _tool_names(analysis_agent=AsyncMock())

    def test_deep_tools_are_absent_without_one(self):
        """選填是刻意的：沒有 AnalysisAgent 的呼叫端仍要拿到可用的工具組。"""
        assert not (DEEP_TOOLS & _tool_names())

    def test_the_other_tools_do_not_depend_on_it(self):
        with_agent = _tool_names(analysis_agent=AsyncMock())
        without = _tool_names()
        assert with_agent - without == DEEP_TOOLS


class TestChatAgentPassesItThrough:
    def test_agent_registers_the_deep_tools(self):
        from storysphere.agents.chat_agent import ChatAgent

        agent = ChatAgent(
            kg_service=AsyncMock(),
            doc_service=AsyncMock(),
            vector_service=AsyncMock(),
            llm=AsyncMock(),
            analysis_agent=AsyncMock(),
        )
        assert DEEP_TOOLS <= set(agent._tool_map)


class TestDepsWiring:
    """`deps.get_chat_agent()` 必須把 analysis_agent 傳進去。

    用 AST 而非實際呼叫：`get_chat_agent()` 會建起整條真的 service 依賴鏈
    （KG、向量庫、LLM），在單元測試裡不適合。這條檢查的是接線有沒有被拆掉，
    而接線是語法層的事實。
    """

    def test_get_chat_agent_passes_analysis_agent(self):
        source = (
            pathlib.Path(__file__).resolve().parents[2]
            / "backend/storysphere/api/deps.py"
        ).read_text(encoding="utf-8")
        tree = ast.parse(source)
        fn = next(
            n for n in ast.walk(tree)
            if isinstance(n, ast.FunctionDef) and n.name == "get_chat_agent"
        )
        call = next(
            n for n in ast.walk(fn)
            if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "ChatAgent"
        )
        assert "analysis_agent" in {kw.arg for kw in call.keywords}, (
            "deps.get_chat_agent() 沒有傳 analysis_agent —— 兩個深度分析工具會"
            "靜默地從 chat agent 的工具組消失（B-104）"
        )
