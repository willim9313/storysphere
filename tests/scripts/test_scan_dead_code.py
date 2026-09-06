"""scan_dead_code 的參考計數不可把說明文字當成引用 — B-098.

這支掃描器自己就是結論的來源，而它已經錯過兩次：一次偽陽性（i18n 模板前綴，
把活的 key 判成未用），一次偽陰性（把符號自己 docstring 裡的提及算成引用，
於是 `ConceptInferencePipeline` 這種真的沒人呼叫的東西看起來是活的）。
偽陰性沒有紅燈可看，所以這裡把它釘住。
"""

from __future__ import annotations

import importlib.util
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SCANNER = REPO_ROOT / "scripts" / "scan_dead_code.py"


def _load():
    """scripts/ 不在 pythonpath（pyproject 只放了 backend），故直接依路徑載入。"""
    spec = importlib.util.spec_from_file_location("scan_dead_code", SCANNER)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestCodeOnly:
    def _strip(self, src: str) -> str:
        return _load()._code_only(src)

    def test_drops_a_name_that_appears_only_in_a_docstring(self):
        src = '''
def f():
    """See WIDGET_LIMIT for the threshold."""
    return 1
'''
        assert "WIDGET_LIMIT" not in self._strip(src)

    def test_drops_a_name_that_appears_only_in_a_comment(self):
        assert "WIDGET_LIMIT" not in self._strip("x = 1  # replaces WIDGET_LIMIT\n")

    def test_drops_a_name_inside_an_f_string_literal(self):
        # 3.12+ 把 f-string 拆成 FSTRING_* token，不再是單一 STRING。
        assert "WIDGET_LIMIT" not in self._strip('msg = f"see WIDGET_LIMIT {x}"\n')

    def test_keeps_an_expression_interpolated_into_an_f_string(self):
        # 內插的是真的引用，不能跟著字面文字一起丟掉。
        assert "widget_limit" in self._strip('msg = f"see {widget_limit}"\n')

    def test_keeps_real_code_references(self):
        code = self._strip("WIDGET_LIMIT = 3\nprint(WIDGET_LIMIT)\n")
        assert code.count("WIDGET_LIMIT") == 2

    def test_unparseable_source_keeps_its_raw_text(self):
        # 失敗方向要安全：多算幾筆說明文字只會漏掉候選，不會憑空生出候選。
        broken = "def f(:\n  # WIDGET_LIMIT\n"
        assert "WIDGET_LIMIT" in self._strip(broken)
