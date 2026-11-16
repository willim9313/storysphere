"""Prompt 載入器：真實 prompt 檔、`{{}}` 取代、缺節／缺欄位。"""

from __future__ import annotations

import pytest
from storysphere.llm.prompts import Prompt, load_prompt


def write_prompt(base, text: str, name: str = "x/p"):
    path = base / f"{name}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


GOOD = """# t

## meta

```yaml
id: x.p
version: 2
task: some_task
```

## system

Reply in {{language_name}}.

## user

{{unit_text}}
"""


class TestRealPrompts:
    @pytest.mark.parametrize(
        ("name", "prompt_id", "task"),
        [
            ("ingest/core_extraction", "ingest.core_extraction", "core_extraction"),
            ("ingest/signal_tagging", "ingest.signal_tagging", "signal_tagging"),
        ],
    )
    def test_loads(self, name, prompt_id, task):
        prompt = load_prompt(name)
        assert (prompt.id, prompt.task) == (prompt_id, task)
        # 版本號會隨 prompt 修改而升，這裡只檢查形狀。
        assert prompt.version.isdigit()
        assert "{{language_name}}" in prompt.system
        assert "{{unit_text}}" in prompt.user

    def test_renders_with_the_three_inputs(self):
        system, user = load_prompt("ingest/core_extraction").render(
            language_name="English", context_text="ctx", unit_text="body"
        )
        assert "{{" not in system + user


class TestRender:
    def test_replaces_placeholders(self):
        prompt = Prompt("i", "1", "t", system="in {{a}}", user="{{b}} and {{a}}")
        assert prompt.render(a="X", b="Y") == ("in X", "Y and X")

    def test_missing_variable_raises_key_error(self):
        prompt = Prompt("i", "1", "t", system="{{a}}", user="{{b}}")
        with pytest.raises(KeyError, match="b"):
            prompt.render(a="X")

    def test_value_with_braces_is_not_expanded_again(self):
        prompt = Prompt("i", "1", "t", system="s", user="{{a}}|{{b}}")
        _, user = prompt.render(a="{{b}}", b="B")
        assert user == "{{b}}|B"


class TestLoad:
    def test_version_is_string(self, tmp_path):
        write_prompt(tmp_path, GOOD)
        prompt = load_prompt("x/p", base_dir=tmp_path)
        assert prompt.version == "2"
        assert prompt.task == "some_task"
        assert prompt.system == "Reply in {{language_name}}."

    @pytest.mark.parametrize("section", ["meta", "system", "user"])
    def test_missing_section(self, tmp_path, section):
        write_prompt(tmp_path, GOOD.replace(f"## {section}", "## other"))
        with pytest.raises(ValueError, match=section):
            load_prompt("x/p", base_dir=tmp_path)

    def test_missing_meta_field(self, tmp_path):
        write_prompt(tmp_path, GOOD.replace("task: some_task\n", ""))
        with pytest.raises(ValueError, match="task"):
            load_prompt("x/p", base_dir=tmp_path)
