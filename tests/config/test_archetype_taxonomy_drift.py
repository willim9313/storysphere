"""跨層契約檢查 —— 前端 taxonomy 的原型名稱必須與後端 config 逐字一致。

角色分析頁的原型篩選（#14）是用**字串相等**比對的：`ArchetypeFilterDropdown`
拿 `frontend/src/data/frameworksData.ts` 的 item 名稱，去比對 `analyzed[].archetypes`
裡的值，而後者存的是後端 config 的名稱。兩邊只要有一個字不同，該原型的 facet
計數就是 0、篩選恆空——不會報錯，只會安靜地篩不出東西。

這個契約過去沒有任何防護，結果 Schmidt 有 5 筆是佔位字串、Jung 有 2 筆名稱漂移，
半年沒被發現（2026-07-18 修正）。本檔案就是那次修正後補上的防護（B-061）。

放後端 pytest 而非前端 vitest 的理由：五道閘門（見 CLAUDE.md）裡有 `pytest`，
沒有 `npm run test`。寫成 vitest 就不會在 CI 跑。
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from storysphere.config.archetypes import load_archetypes

REPO_ROOT = Path(__file__).resolve().parents[2]
FRAMEWORKS_DATA = REPO_ROOT / "frontend" / "src" / "data" / "frameworksData.ts"

# 前端每個語言各一個陣列；後端 config 檔名用 zh / en 後綴。
_LOCALE_ARRAYS = {"zh": "FRAMEWORKS_ZH", "en": "FRAMEWORKS_EN"}

# items 陣列裡的一列，形如：{ id: 'hero', name: '英雄', subtitle: 'hero', … }
_ITEM_RE = re.compile(r"\{ id: '([^']+)', name: '([^']*)'")


def _array_region(source: str, array_name: str) -> str:
    """取出 `const <array_name>: RawFramework[] = [` 到下一個頂層宣告之間的文字。"""
    m = re.search(rf"const {array_name}: RawFramework\[\] = \[", source)
    assert m, f"{FRAMEWORKS_DATA.name} 裡找不到 {array_name}——解析器需要更新"
    rest = source[m.end() :]
    nxt = re.search(r"\n(?:const|function|export) ", rest)
    return rest[: nxt.start()] if nxt else rest


def _framework_items(region: str, key: str) -> dict[str, str]:
    """回傳某個 framework 的 {id: name}。"""
    m = re.search(rf"key: '{key}',", region)
    assert m, f"{FRAMEWORKS_DATA.name} 裡找不到 key: '{key}'——解析器需要更新"
    rest = region[m.end() :]
    nxt = re.search(r"\n    key: '", rest)  # 下一個 framework 的起點
    block = rest[: nxt.start()] if nxt else rest

    items_at = re.search(r"items: \[", block)
    assert items_at, f"framework '{key}' 底下找不到 items 陣列——解析器需要更新"
    return dict(_ITEM_RE.findall(block[items_at.end() :]))


@pytest.mark.parametrize("framework", ["jung", "schmidt"])
@pytest.mark.parametrize("lang", ["zh", "en"])
class TestArchetypeTaxonomyParity:
    def _frontend(self, framework: str, lang: str) -> dict[str, str]:
        source = FRAMEWORKS_DATA.read_text(encoding="utf-8")
        return _framework_items(_array_region(source, _LOCALE_ARRAYS[lang]), framework)

    def test_parser_finds_items(self, framework: str, lang: str):
        """解析器自身的哨兵：抓不到東西時要在這裡爆，而不是讓比對變成空對空。"""
        assert self._frontend(framework, lang), (
            f"{FRAMEWORKS_DATA.name} 的 {framework}/{lang} 解析出 0 筆——"
            "多半是檔案格式變了，解析器需要更新"
        )

    def test_names_match_backend_config_verbatim(self, framework: str, lang: str):
        """id → name 的對應必須兩邊逐字相同（不比對順序，前端排版可自訂）。"""
        frontend = self._frontend(framework, lang)
        backend = {a["id"]: a["name"] for a in load_archetypes(framework, lang)}
        assert frontend == backend
