"""提示裡提到的工具，必須真的綁在模型上 —— B-119。

`SYSTEM_PROMPT` 把 16/23 個工具名寫成路由規則，而 `get_chat_tools()` 在沒有
`analysis_agent` 時會少給兩個。兩份真相不一致時**提示會贏**：2026-09-12 實測，
沒有 AnalysisAgent 的 agent 5/5 次呼叫了從未被提供的 `analyze_event`，參數還
編得像模像樣，而 `ToolNode` 解不掉這種呼叫。

這裡釘住的不是「提示長什麼樣」，是**提示與實際綁定的工具不會各說各話**。
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

DEEP_TOOLS = {"analyze_character", "analyze_event"}


def _all_names() -> set[str]:
    from storysphere.tools.tool_registry import get_all_tool_names

    return set(get_all_tool_names())


def _mentioned(prompt: str) -> set[str]:
    """工具名在提示裡被提到幾個——只認註冊表裡的名字，不猜。"""
    import re

    return {n for n in _all_names() if re.search(rf"\b{re.escape(n)}\b", prompt)}


class TestPruning:
    def test_full_tool_set_leaves_the_prompt_untouched(self):
        """沒有東西缺席時不該動提示——裁剪必須是零成本的。"""
        from storysphere.agents.chat_agent_base import SYSTEM_PROMPT, prune_prompt_for_tools

        assert prune_prompt_for_tools(SYSTEM_PROMPT, _all_names()) == SYSTEM_PROMPT

    def test_missing_tools_lose_their_routing_advice(self):
        from storysphere.agents.chat_agent_base import SYSTEM_PROMPT, prune_prompt_for_tools

        pruned = prune_prompt_for_tools(SYSTEM_PROMPT, _all_names() - DEEP_TOOLS)
        assert not (DEEP_TOOLS & _mentioned(pruned))

    def test_a_sibling_clause_on_the_same_line_survives(self):
        """按子句裁而不是按行裁。

        `get_event_profile` 與 `analyze_event` 寫在同一行、用 `;` 分開；
        整行砍掉會連帶拿走前者的路由建議，那是用一個缺陷換另一個。
        """
        from storysphere.agents.chat_agent_base import SYSTEM_PROMPT, prune_prompt_for_tools

        pruned = prune_prompt_for_tools(SYSTEM_PROMPT, _all_names() - {"analyze_event"})
        assert "get_event_profile" in pruned
        assert "analyze_event" not in pruned


class TestAgentParity:
    """真正要防的東西：agent 拿到的提示不會提到它沒綁的工具。"""

    @pytest.mark.parametrize("with_agent", [True, False])
    def test_prompt_never_names_an_unbound_tool(self, with_agent):
        """走 `_build_messages` 的真實路徑，不自己把 bound 餵進去。

        第一版是直接呼叫 `build_context_prompt(state, lang, bound)`——那測的是
        裁剪函式，不是「agent 有沒有把自己綁定的工具傳下去」。哨兵測試當場抓到：
        把 `chat_agent.py` 的接線拆掉，那一版 6 條全過。**測試要走使用者走的那條路。**
        """
        from storysphere.agents.chat_agent import ChatAgent
        from storysphere.agents.states import ChatState

        agent = ChatAgent(
            kg_service=AsyncMock(),
            doc_service=AsyncMock(),
            vector_service=AsyncMock(),
            llm=AsyncMock(),
            analysis_agent=AsyncMock() if with_agent else None,
        )
        bound = set(agent._tool_map)
        messages = agent._build_messages("hello", "en", ChatState())
        system = next(m for m in messages if type(m).__name__ == "SystemMessage")
        named = _mentioned(str(system.content))
        assert named <= bound, f"提示提到了沒綁上的工具：{named - bound}"

    def test_the_deep_tools_are_the_case_this_guards(self):
        """沒有 agent 時確實會少那兩個——否則上面那條是空轉的。"""
        from storysphere.agents.chat_agent import ChatAgent

        agent = ChatAgent(
            kg_service=AsyncMock(),
            doc_service=AsyncMock(),
            vector_service=AsyncMock(),
            llm=AsyncMock(),
        )
        assert not (DEEP_TOOLS & set(agent._tool_map))
