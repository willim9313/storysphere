"""文件漂移檢查 —— 讓契約文件與實作的落差在 CI 就爆掉，而不是靠人工比對。

涵蓋五項：

* ``docs/API_CONTRACT.md`` —— 每個 ``/api/v1`` 路由都必須要嘛有規格、要嘛被明確
  列進「未納入契約的端點」表。反向也檢查：文件寫了但程式碼沒有的端點。
* ``docs/DESIGN_TOKENS.md`` —— ``tokens.css`` 的每個 token 都必須在對照表裡找得到。
* ``docs/plans/README.md`` —— 索引與目錄內容一致（雙向）。
* 全文件的**相對連結**都指向存在的檔案。
* 全文件**反引號裡的 ``docs/**.md`` 路徑**都指向存在的檔案 —— 文件之間多半是用
  code span 而非 markdown link 互相引用，這條補的是搬檔後靜默斷鏈的缺口。

全部只讀檔案，不需要啟動後端。
"""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
API_CONTRACT = REPO_ROOT / "docs" / "API_CONTRACT.md"
DESIGN_TOKENS = REPO_ROOT / "docs" / "DESIGN_TOKENS.md"
TOKENS_CSS = REPO_ROOT / "frontend" / "src" / "styles" / "tokens.css"
PLANS_DIR = REPO_ROOT / "docs" / "plans"
PLANS_INDEX = PLANS_DIR / "README.md"

# 連結檢查的掃描範圍：docs/ 全部 + repo 根目錄的三份說明文件。
LINK_SCAN_EXTRA = ("README.md", "README.zh-TW.md", "CLAUDE.md")
# 例外：plans/ 是凍結的日期快照，CLAUDE.md 明定不回頭修改（索引 README 除外）。
# 強制它們的連結永遠有效，等於逼人去改歷史紀錄。
LINK_SCAN_SKIP_DIRS = (REPO_ROOT / "docs" / "plans",)

API_PREFIX = "/api/v1"

# 不走 /api/v1、因此不在本檢查範圍內的路由。
# `/ws/chat` 的協議記在 API_CONTRACT 的 WebSocket 章節，但它不是 REST 端點，
# 無法用同一套「METHOD + path」比對。
NON_REST_PATHS = frozenset({"/health", "/openapi.json", "/docs", "/redoc", "/ws/chat"})

# `### #<編號> <METHOD> <path>` —— 契約裡每個端點標題的唯一合法格式。
HEADING_RE = re.compile(
    r"^### (#[0-9]+[a-z0-9-]*) ((?:GET|POST|PUT|PATCH|DELETE)) (\S+)\s*$",
    re.MULTILINE,
)
# 「未納入契約的端點」表格裡的 `` `GET /documents` `` 儲存格。
UNLISTED_SECTION_RE = re.compile(
    r"^## 未納入契約的端點\s*$(.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL
)
UNLISTED_ROW_RE = re.compile(r"`((?:GET|POST|PUT|PATCH|DELETE)) ([^`]+)`")


def _normalise(method: str, path: str) -> str:
    """把路徑正規化成可比對的形式。

    契約寫 `:bookId`、FastAPI 寫 `{book_id}`，同一個東西兩種寫法；路徑參數的
    *名稱* 不是契約的一部分（改名不算破壞契約），所以一律抹成 `:P` 再比。
    尾斜線同理，`/search/` 與 `/search` 指同一個端點。
    """
    path = re.sub(r"\{[^}]+\}", ":P", path)
    path = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", ":P", path)
    path = path.rstrip("/") or "/"
    return f"{method.upper()} {path}"


def _contract_text() -> str:
    return API_CONTRACT.read_text(encoding="utf-8")


def _documented() -> dict[str, str]:
    """契約中有完整規格的端點：正規化路徑 -> 編號。"""
    return {
        _normalise(method, path): eid
        for eid, method, path in HEADING_RE.findall(_contract_text())
    }


def _unlisted() -> set[str]:
    """「未納入契約的端點」表裡明確宣告的路由。

    列進這張表是一個刻意的動作 —— 等於承認「這條路由存在但不打算支援」。
    """
    section = UNLISTED_SECTION_RE.search(_contract_text())
    if section is None:
        return set()
    return {
        _normalise(method, path) for method, path in UNLISTED_ROW_RE.findall(section.group(1))
    }


def _implemented() -> dict[str, str]:
    """實際掛在 app 上的 REST 路由：正規化路徑 -> 原始路徑。

    直接建 app 讀 `app.routes`，不解析原始碼 —— router 前綴、巢狀 include
    這些都由 FastAPI 自己算好，比 regex 可靠。
    """
    from storysphere.api.main import create_app

    app = create_app()
    routes: dict[str, str] = {}
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith(API_PREFIX) or path in NON_REST_PATHS:
            continue
        for method in getattr(route, "methods", None) or ():
            if method == "HEAD":
                continue
            trimmed = path[len(API_PREFIX) :] or "/"
            routes[_normalise(method, trimmed)] = f"{method} {path}"
    return routes


class TestApiContractCoverage:
    def test_every_route_is_documented_or_declared_unlisted(self) -> None:
        """新增端點卻沒寫進契約 —— 這是最常見的漂移。"""
        undocumented = sorted(set(_implemented()) - set(_documented()) - _unlisted())
        assert not undocumented, (
            "以下端點已實作，但 docs/API_CONTRACT.md 既沒有規格、也沒列入"
            "「未納入契約的端點」：\n  " + "\n  ".join(undocumented)
        )

    def test_no_documented_endpoint_is_missing_from_code(self) -> None:
        """契約寫了但程式碼沒有 —— 端點被刪掉或改路徑時會抓到。"""
        documented = _documented()
        phantom = sorted(set(documented) - set(_implemented()))
        assert not phantom, (
            "以下端點寫在 docs/API_CONTRACT.md，但 app 上找不到對應路由"
            "（已刪除或路徑變更？）：\n  "
            + "\n  ".join(f"{documented[k]} {k}" for k in phantom)
        )

    def test_unlisted_routes_still_exist(self) -> None:
        """「未納入契約」的路由被刪掉後，該表也要跟著清掉。"""
        stale = sorted(_unlisted() - set(_implemented()))
        assert not stale, (
            "「未納入契約的端點」表裡的這些路由已不存在於程式碼，請一併移除該列：\n  "
            + "\n  ".join(stale)
        )


class TestApiContractFormat:
    """編號與標題格式是其他工具（含本檔）解析契約的前提，壞掉會讓檢查靜默失效。"""

    def test_endpoint_ids_are_unique(self) -> None:
        ids = [eid for eid, _, _ in HEADING_RE.findall(_contract_text())]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        assert not dupes, (
            f"端點編號重複：{dupes}。編號被 UI_SPEC 與程式碼註解引用，"
            "重複會讓引用無法判斷指向哪一條。"
        )

    def test_every_h3_heading_is_an_endpoint(self) -> None:
        """說明性小節一律用 `##`；`###` 保留給端點。"""
        bad = [
            line
            for line in _contract_text().splitlines()
            if line.startswith("### ") and not HEADING_RE.match(line)
        ]
        assert not bad, (
            "以下 `###` 標題不符合 `### #<編號> <METHOD> <path>` 格式；"
            "說明性小節請改用 `##`：\n  " + "\n  ".join(bad)
        )


class TestDesignTokenCoverage:
    """`tokens.css` 的每個 token 都要能在 DESIGN_TOKENS.md 找到。

    注意對照表有兩種寫法：一種是 `| --token | warm | ink |` 直接列名，另一種是
    矩陣表（列 = 類型、欄 = 屬性，如 §3.7 實體 Pill），後者 token 名稱不會字面
    出現。因此判定條件是「**名稱**出現，或該 token 的**值**出現」—— 矩陣表的
    格子裡放的就是值。
    """

    @staticmethod
    def _css_tokens() -> dict[str, set[str]]:
        css = TOKENS_CSS.read_text(encoding="utf-8")
        tokens: dict[str, set[str]] = {}
        for name, value in re.findall(r"(--[a-z0-9-]+)\s*:\s*([^;]+);", css):
            tokens.setdefault(name, set()).add(value.strip())
        return tokens

    def test_every_token_is_documented(self) -> None:
        doc = DESIGN_TOKENS.read_text(encoding="utf-8")
        literal = set(re.findall(r"--[a-z0-9-]+", doc))
        missing = sorted(
            name
            for name, values in self._css_tokens().items()
            if name not in literal and not any(v in doc for v in values)
        )
        assert not missing, (
            "以下 token 定義在 frontend/src/styles/tokens.css，但 docs/DESIGN_TOKENS.md "
            "的對照表既找不到名稱也找不到值（CLAUDE.md：新增 token 必須同步更新對照表）：\n  "
            + "\n  ".join(missing)
        )

    def test_documented_tokens_still_exist(self) -> None:
        """文件列了但 css 已刪除的 token —— 反向漂移。

        只認**表格首欄**的 token 名，不掃散文。散文裡的 `--entity-character-*`
        是萬用字元、`--tab-radius` 是「將來可以加這種 token」的舉例，兩者都不是
        「這個 token 存在」的宣稱，掃進來只會製造假警報。
        """
        doc = DESIGN_TOKENS.read_text(encoding="utf-8")
        css_names = set(self._css_tokens())
        documented = set(re.findall(r"^\|\s*`(--[a-z0-9-]+)", doc, re.MULTILINE))
        stale = sorted(documented - css_names)
        assert not stale, (
            "以下 token 出現在 docs/DESIGN_TOKENS.md，但 tokens.css 裡已不存在：\n  "
            + "\n  ".join(stale)
        )


FENCE_RE = re.compile(r"^\s*(```|~~~)")
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")

# 反引號裡的文件路徑，如 `docs/API_CONTRACT.md`。一律視為 repo 根目錄相對。
CODE_SPAN_DOC_RE = re.compile(r"^docs/[\w./-]+\.md$")
# `docs/plans/<YYYYMMDD>-foo.md` 這種佔位寫法不算路徑 —— `<>` 不在字元集內，自然被排除。

# 只驗 `docs/**.md`，**不驗** `.py` / `.tsx` 等程式碼路徑：BACKLOG 大量引用
# 「將建立」的未來檔案（`services/rhythm_service.py` 之類），那是規劃的正常寫法，
# 驗了會一律誤判。實測驗程式碼路徑會產生 72 筆違規，真問題只有個位數。
CODE_SPAN_SKIP_DIRS = (
    REPO_ROOT / "docs" / "plans",
    REPO_ROOT / "docs" / "archive",
)


def _markdown_links(path: Path) -> list[tuple[int, str]]:
    """抽出檔案裡的 markdown 連結目標，回傳 (行號, target)。

    兩層過濾，都是踩過坑才加的：

    * **跳過 ``` 圍欄區塊** —— 裡面的「連結」是範例程式碼或示範片段，不是導覽。
      歸檔的 DOCS_STRUCTURE_PROPOSAL 就有一段示範 CORE.md 未來長相的 markdown
      區塊，不跳過會誤報 5 條。
    * **移除行內 code span** —— 反引號裡的連結語法同理是舉例，不是真連結。
    """
    out: list[tuple[int, str]] = []
    in_fence = False
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if FENCE_RE.match(raw):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        line = INLINE_CODE_RE.sub("", raw)
        out.extend((lineno, m.group(1)) for m in LINK_RE.finditer(line))
    return out


def _scanned_docs() -> list[Path]:
    files = [
        p
        for p in (REPO_ROOT / "docs").rglob("*.md")
        if not any(skip in p.parents for skip in LINK_SCAN_SKIP_DIRS)
    ]
    files += [REPO_ROOT / name for name in LINK_SCAN_EXTRA]
    return sorted(p for p in files if p.is_file())


class TestDocumentLinks:
    """相對連結必須指向存在的檔案。

    只驗**檔案是否存在**，不驗 ``#anchor`` 是否對得上標題 —— 各家 markdown 渲染器
    對中文標題的 slug 規則不一致，驗了會製造假警報。外部 URL 同樣不驗（不連網）。
    """

    def test_no_broken_relative_links(self) -> None:
        broken: list[str] = []
        for doc in _scanned_docs():
            for lineno, target in _markdown_links(doc):
                if target.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                rel = unquote(target.split("#", 1)[0]).strip()
                if not rel:
                    continue
                if not (doc.parent / rel).resolve().exists():
                    broken.append(f"{doc.relative_to(REPO_ROOT)}:{lineno} → {target}")
        assert not broken, "以下相對連結指向不存在的檔案：\n  " + "\n  ".join(broken)


def _code_span_doc_paths(path: Path) -> list[tuple[int, str]]:
    """抽出反引號裡的 ``docs/**.md`` 路徑，回傳 (行號, 路徑)。

    與 :func:`_markdown_links` 相反 —— 那個把 code span *移除*，這個只看 code span。
    圍欄區塊同樣跳過（裡面是範例與示意樹狀圖，不是引用）。
    """
    out: list[tuple[int, str]] = []
    in_fence = False
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if FENCE_RE.match(raw):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for m in INLINE_CODE_RE.finditer(raw):
            token = m.group(0).strip("`").strip()
            if CODE_SPAN_DOC_RE.match(token):
                out.append((lineno, token))
    return out


class TestCodeSpanDocPaths:
    """反引號裡的 ``docs/**.md`` 路徑也必須指向存在的檔案。

    為什麼要單獨驗這個：文件之間**大多不是用 markdown link 互相引用的**，而是寫成
    `` `docs/API_CONTRACT.md` `` 這種 code span。:class:`TestDocumentLinks` 只看
    markdown link，看不到這些——2026-08-15 撤銷 ``docs/notes/`` 那次，12 處引用
    全是 code span，測試一條都沒攔到，靠人工掃才發現。這個檢查補的就是那個缺口。

    ``plans/`` 與 ``archive/`` 跳過：兩者都是凍結文件，明訂不回頭修改，
    強制它們的路徑永遠有效等於逼人去改歷史紀錄。
    """

    def test_no_missing_doc_paths_in_code_spans(self) -> None:
        broken: list[str] = []
        for doc in _scanned_docs():
            if any(skip in doc.parents for skip in CODE_SPAN_SKIP_DIRS):
                continue
            for lineno, target in _code_span_doc_paths(doc):
                if not (REPO_ROOT / target).exists():
                    broken.append(f"{doc.relative_to(REPO_ROOT)}:{lineno} → {target}")
        assert not broken, (
            "以下反引號路徑指向不存在的文件（搬檔或改名後忘了同步？）：\n  "
            + "\n  ".join(broken)
        )


class TestPlansIndex:
    """`docs/plans/README.md` 必須列出目錄下的每一份規劃文件。

    只驗**完整性**，不驗狀態 —— plans 是凍結的日期快照，實作後不再維護，
    一個沒人更新的狀態欄比沒有更危險（判斷是否落地請看 git log 或 BACKLOG_ARCHIVE）。
    """

    @staticmethod
    def _plan_files() -> set[str]:
        return {p.name for p in PLANS_DIR.glob("*.md") if p.name != "README.md"}

    def test_every_plan_is_indexed(self) -> None:
        index = PLANS_INDEX.read_text(encoding="utf-8")
        missing = sorted(name for name in self._plan_files() if name not in index)
        assert not missing, (
            "以下規劃文件不在 docs/plans/README.md 索引中，請補上一列：\n  "
            + "\n  ".join(missing)
        )

    def test_index_has_no_dead_entries(self) -> None:
        listed = set(re.findall(r"\]\(\./([^)]+\.md)\)", PLANS_INDEX.read_text(encoding="utf-8")))
        stale = sorted(listed - self._plan_files())
        assert not stale, (
            "docs/plans/README.md 列了不存在的檔案（已改名或刪除？）：\n  " + "\n  ".join(stale)
        )


@pytest.mark.parametrize("path", [API_CONTRACT, DESIGN_TOKENS, TOKENS_CSS, PLANS_INDEX])
def test_source_files_exist(path: Path) -> None:
    """路徑寫死在本檔，檔案搬家時要立刻知道，而不是讓檢查悄悄變成空集合。"""
    assert path.is_file(), f"找不到 {path}，本檢查已失效"
