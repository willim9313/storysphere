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
from storysphere.config.hero_journey import load_hero_journey
from storysphere.config.mythos import load_mythos

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


# 前端 key → 後端載入方式。B-061 只蓋了 jung / schmidt 兩個，但
# frameworksData.ts 有 8 個 framework、其中 5 個有後端對應檔；剩下三個
# （chatman / genette_temporal_order / sep_methodology）是純前端理論文字，
# 沒有後端來源可比對，故不在此列（B-093）。
_BACKEND_LOADER = {
    "jung": lambda lang: load_archetypes("jung", lang),
    "schmidt": lambda lang: load_archetypes("schmidt", lang),
    "hero_journey": load_hero_journey,
    # load_mythos 收的是 'frye' / 'booker'，與前端 key 不同名。
    "frye_mythos": lambda lang: load_mythos("frye", lang),
    "booker_plots": lambda lang: load_mythos("booker", lang),
}

# 前端把八個 framework 放在同一份清單裡，id 必須全域唯一；Frye 的四個 mythos
# 已經佔用了 comedy 與 tragedy，所以 Booker 那兩個加了後綴。這是**刻意**的
# 消歧義，不是漂移——天真地比對 id 會在這裡誤報。
_FRONTEND_ID_SUFFIX = {
    "booker_plots": {"comedy": "comedy_booker", "tragedy": "tragedy_booker"},
}


def _expected_frontend_ids(framework: str, backend: dict[str, str]) -> set[str]:
    rename = _FRONTEND_ID_SUFFIX.get(framework, {})
    return {rename.get(i, i) for i in backend}


@pytest.mark.parametrize("framework", sorted(_BACKEND_LOADER))
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

    def _backend(self, framework: str, lang: str) -> dict[str, str]:
        return {a["id"]: a["name"] for a in _BACKEND_LOADER[framework](lang)}

    def test_ids_match_backend_config(self, framework: str, lang: str):
        """id 集合必須對等——那才是真正跨越邊界的東西。

        名稱漂移是顯示問題，id 漂移是功能問題：英雄旅程的 UI 是拿
        `stage_id` 去 frameworksData 查顯示名（`CrossEvidence.tsx:62`），
        id 少一個就直接掉到 fallback。Booker 的刻意後綴在
        `_FRONTEND_ID_SUFFIX` 換算後才比對。
        """
        backend = self._backend(framework, lang)
        assert set(self._frontend(framework, lang)) == _expected_frontend_ids(
            framework, backend
        )

    def test_names_match_backend_config_verbatim(self, framework: str, lang: str):
        """名稱也必須逐字相同（不比對順序，前端排版可自訂）。

        對 jung / schmidt 這是功能契約：原型篩選用字串相等計數，差一個字
        facet 就是 0。對其餘三個目前只是一致性——但維持**同一條規則**比
        「除了某某以外」好記，也省得日後有人得先查清楚哪個 framework 適用
        哪套判準。
        """
        rename = _FRONTEND_ID_SUFFIX.get(framework, {})
        backend = {rename.get(i, i): n for i, n in self._backend(framework, lang).items()}
        assert self._frontend(framework, lang) == backend
