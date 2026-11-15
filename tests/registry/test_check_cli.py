from __future__ import annotations

from storysphere.registry.__main__ import GROUPS, check, main


def _make_registry(root):
    for group in GROUPS:
        (root / group).mkdir(parents=True)
    return root


class TestRegistryCheckCli:
    def test_empty_registry_passes(self, tmp_path):
        assert check(_make_registry(tmp_path)) == 0

    def test_declarations_without_checker_fail(self, tmp_path):
        root = _make_registry(tmp_path)
        (root / "methods" / "x.yaml").write_text("kind: method\n", encoding="utf-8")

        assert check(root) == 1

    def test_unknown_command_is_usage_error(self):
        assert main(["nope"]) == 2
