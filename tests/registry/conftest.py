from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml

REAL_REGISTRY = Path(__file__).resolve().parents[2] / "registry"


class RegistryDir:
    """正式 registry 的一份可修改副本，用來做「故意做壞」的測試。"""

    def __init__(self, root: Path) -> None:
        self.root = root

    def read(self, relative: str) -> dict:
        return yaml.safe_load((self.root / relative).read_text(encoding="utf-8"))

    def write(self, relative: str, data: dict) -> None:
        path = self.root / relative
        path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")

    def edit(self, relative: str, change) -> None:
        data = self.read(relative)
        change(data)
        self.write(relative, data)


@pytest.fixture
def registry_dir(tmp_path) -> RegistryDir:
    root = tmp_path / "registry"
    shutil.copytree(REAL_REGISTRY, root)
    return RegistryDir(root)
