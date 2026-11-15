from __future__ import annotations

import json

from storysphere.registry.__main__ import check, dag, main

from tests.registry.conftest import REAL_REGISTRY


class TestRegistryCli:
    def test_check_passes_on_real_registry(self, capsys):
        assert check(REAL_REGISTRY) == 0
        assert "registry ok: 18 methods, 2 methodologies" in capsys.readouterr().out

    def test_check_fails_and_names_the_rule(self, registry_dir, capsys):
        registry_dir.edit(
            "methods/CH5.yaml", lambda d: d["requires"].append({"claim_type": "reveal"})
        )

        assert check(registry_dir.root) == 1
        assert "[R3]" in capsys.readouterr().err

    def test_check_fails_on_unreadable_declaration(self, registry_dir, capsys):
        (registry_dir.root / "methods" / "MY4.yaml").write_text("kind: [", encoding="utf-8")

        assert check(registry_dir.root) == 1
        assert "[load]" in capsys.readouterr().err

    def test_check_fails_on_empty_registry(self, tmp_path):
        # 沒有任何宣告時，33 種證據類型都沒人宣告
        assert check(tmp_path) == 1

    def test_dag_prints_json(self, capsys):
        assert dag(REAL_REGISTRY) == 0

        output = json.loads(capsys.readouterr().out)
        assert {"nodes", "edges"} == set(output)
        assert any(node["id"] == "event" for node in output["nodes"])

    def test_unknown_command_is_usage_error(self):
        assert main(["nope"]) == 2
